# backend/app/crawler.py
import asyncio
import logging
from collections import deque
from typing import Literal
from urllib.parse import urljoin, urlparse, urlunparse

import aiohttp
from bs4 import BeautifulSoup
from fake_useragent import UserAgent

from .database import Neo4jDatabase
from .models import PageData
from .websocket import ConnectionManager

logger = logging.getLogger(__name__)


class CrawlProfiler:
    """Profiler pour mesurer les temps d'exécution de chaque étape du crawl."""

    def __init__(self, crawl_id: str):
        self.crawl_id = crawl_id
        self.timings: dict[str, list[float]] = {}
        self.current_page_start: float = 0
        self.page_count = 0

    def start_page(self):
        """Démarre le chrono pour une nouvelle page."""
        import time

        self.current_page_start = time.perf_counter()
        self.page_count += 1

    def record(self, operation: str, duration: float):
        """Enregistre le temps d'une opération."""
        if operation not in self.timings:
            self.timings[operation] = []
        self.timings[operation].append(duration)

    def log_summary(self):
        """Affiche un résumé des temps moyens par opération."""
        logger.info(f"\n{'=' * 60}")
        logger.info(f"⏱️  PROFILING SUMMARY - Crawl {self.crawl_id}")
        logger.info(f"{'=' * 60}")
        logger.info(f"📄 Total pages crawled: {self.page_count}")

        total_time = 0
        for operation, times in sorted(self.timings.items(), key=lambda x: -sum(x[1])):
            avg = sum(times) / len(times) if times else 0
            total = sum(times)
            total_time += total
            count = len(times)
            logger.info(f"   {operation:25} | avg: {avg * 1000:7.1f}ms | total: {total:6.2f}s | count: {count}")

        logger.info(f"{'=' * 60}")
        logger.info(f"⏱️  TOTAL TIME IN OPERATIONS: {total_time:.2f}s")
        logger.info(f"{'=' * 60}\n")


class WebCrawler:
    def __init__(
        self,
        crawl_id: str,
        root_url: str,
        max_depth: int,
        max_pages: int,
        db: Neo4jDatabase,
        manager: ConnectionManager,
        crawl_mode: Literal["INTERNAL", "EXTERNAL", "ALL"] = "EXTERNAL",
        algorithm: Literal["BFS", "DFS"] = "BFS",
    ):
        self.crawl_id = crawl_id
        self.root_url = root_url
        self.max_depth = max_depth
        self.max_pages = max_pages
        self.db = db
        self.manager = manager
        self.crawl_mode = crawl_mode
        self.algorithm = algorithm

        self.visited_urls: set[str] = set()
        self.pages_crawled = 0
        self.links_found = 0

        # Tracker les redirections
        self.url_redirects: dict[str, str] = {}
        self.pending_links: list[tuple] = []

        self.root_domain = urlparse(root_url).netloc
        self.timeout = aiohttp.ClientTimeout(total=30)

        # Fake User Agent pour passer incognito
        self.ua = UserAgent()

        if algorithm == "BFS":
            self.to_visit = deque()
        else:
            self.to_visit = []

        # ✅ NOUVEAU : Compteur pour réguler le débit WebSocket
        self.msg_count = 0

        # Flag pour arrêt gracieux du crawl
        self.stop_requested = False

        # ✅ PROFILER pour mesurer les performances
        self.profiler = CrawlProfiler(crawl_id)

        logger.info(f"WebCrawler initialized: mode={crawl_mode}, algo={algorithm}")

    def request_stop(self):
        """Demande l'arrêt gracieux du crawl (les redirects seront envoyées avant la fin)"""
        logger.info(f"Stop requested for crawl {self.crawl_id}")
        self.stop_requested = True

    async def _broadcast_throttled(self, message: dict):
        """Envoie un message WebSocket avec une micro-pause régulière pour ne pas tuer le Front"""
        await self.manager.broadcast(self.crawl_id, message)

        self.msg_count += 1
        # Tous les 10 messages, on dort 20ms
        # Cela limite le débit max à ~500 messages/seconde, ce qui est digeste pour le navigateur
        if self.msg_count % 10 == 0:
            await asyncio.sleep(0.02)

    async def _broadcast_incoming_links(self, target_url: str):
        """
        Broadcast links from already-crawled pages that point to this URL.
        This handles the case where page A links to page B, but B is crawled after A.
        """
        incoming_links = await self.db.get_incoming_links_from_crawled(self.crawl_id, target_url)
        for source_url in incoming_links:
            await self._broadcast_throttled(
                {
                    "type": "link_created",
                    "data": {"source": source_url, "target": target_url, "anchor": ""},
                }
            )

    def _get_headers(self):
        """Génère des headers aléatoires (Mode Ninja)"""
        return {
            "User-Agent": self.ua.random,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }

    @staticmethod
    def _normalize_url(url: str) -> str:
        parsed = urlparse(url)
        # Normalize path: remove trailing slash, treat "/" and "" the same
        path = parsed.path.rstrip("/")
        normalized = urlunparse((parsed.scheme, parsed.netloc.lower(), path, "", parsed.query, ""))
        return normalized

    @staticmethod
    def _get_link_type(link_tag) -> str:
        """
        Detect if a link is structural (nav/footer/header) or content.
        Logic: Safe Zone (main) takes priority, then check for structural elements.
        """
        # Mots-clés qui indiquent du "Bruit" (Navigation, Pub, Footer...)
        structural_tags = ["nav", "header", "footer", "aside"]
        structural_keywords = [
            "menu",
            "navbar",
            "sidebar",
            "sidenav",
            "breadcrumb",
            "pagination",
            "footer",
            "widget",
            "popup",
        ]

        # On remonte l'arbre généalogique
        for parent in link_tag.parents:
            if parent is None or parent.name == "body":
                break

            # --- A. LA SAFE ZONE (Le Bouclier) ---
            # Si on trouve ça, on est SÛR que c'est du bon contenu.
            # On s'arrête immédiatement : le contenu gagne toujours.

            # 1. La balise officielle HTML5
            if parent.name == "main":
                return "content"

            # 2. L'attribut d'accessibilité (très fiable aussi)
            if parent.get("role") == "main":
                return "content"

            # 3. Les IDs classiques des vieux sites (div id="main" ou id="content")
            parent_id = str(parent.get("id", "")).lower()
            if parent_id in ["main", "content", "body-content", "page-content"]:
                return "content"

            # --- B. LA ZONE DE DANGER (Le Structurel) ---
            # Si on n'a pas encore trouvé de <main>, on vérifie si on est dans du bruit.

            # 1. Vérif par Balise interdite
            if parent.name in structural_tags:
                return "structural"

            # 2. Vérif par Classe CSS suspecte
            # On concatène classes et ID pour chercher dedans
            parent_classes = parent.get("class", [])
            class_str = " ".join(parent_classes).lower() + " " + parent_id

            if any(keyword in class_str for keyword in structural_keywords):
                return "structural"

        # Si on arrive en haut sans rien trouver, par défaut on garde le lien
        return "content"

    async def start(self):
        logger.info(f"Starting crawl {self.crawl_id} for {self.root_url}")

        self._add_to_queue(self.root_url, 0)
        headers = self._get_headers()

        async with aiohttp.ClientSession(timeout=self.timeout, headers=headers) as session:
            while self._has_urls() and self.pages_crawled < self.max_pages:
                # Petite pause pour laisser respirer la boucle d'événements Python
                await asyncio.sleep(0.01)

                # Vérifier si des clients sont encore connectés
                if not self.manager.has_connections(self.crawl_id):
                    logger.warning(f"No clients connected for crawl {self.crawl_id}, stopping.")
                    break

                # Vérifier si un arrêt gracieux a été demandé
                if self.stop_requested:
                    logger.info(f"Graceful stop for crawl {self.crawl_id}, processing redirects...")
                    break

                queue_len = len(self.to_visit)
                logger.debug(f"Queue size for {self.crawl_id}: {queue_len}")
                url, depth = self._get_next_url()

                if url in self.visited_urls:
                    continue

                if depth > self.max_depth:
                    continue

                self.visited_urls.add(url)
                await self._crawl_page(session, url, depth)

        await self._update_redirect_links()
        await self._finalize_crawl()

        # ✅ AFFICHAGE DU PROFILING
        self.profiler.log_summary()

        logger.info(f"Crawl {self.crawl_id} completed. Pages: {self.pages_crawled}, Links: {self.links_found}")

        # ✅ LANCEMENT DES EMBEDDINGS EN BACKGROUND (non-bloquant)
        logger.info(f"🧠 Launching background embedding generation for crawl {self.crawl_id}")

        async def on_embeddings_complete():
            """Callback appelé quand les embeddings sont terminés - notifie le frontend via WebSocket"""
            await self.manager.broadcast(
                self.crawl_id,
                {"type": "embedding_completed", "data": {"crawl_id": self.crawl_id}},
            )
            logger.info(f"📡 Sent embedding_completed notification for crawl {self.crawl_id}")

        asyncio.create_task(self.db.generate_embeddings_for_crawl(self.crawl_id, on_complete=on_embeddings_complete))

    def _add_to_queue(self, url: str, depth: int):
        if self.algorithm == "BFS":
            self.to_visit.append((url, depth))
        else:
            self.to_visit.insert(0, (url, depth))
        logger.debug(f"Enqueued {url} (depth: {depth}) for crawl {self.crawl_id}. Queue len: {len(self.to_visit)}")

    def _has_urls(self) -> bool:
        return len(self.to_visit) > 0

    def _get_next_url(self):
        if self.algorithm == "BFS":
            return self.to_visit.popleft()
        else:
            return self.to_visit.pop(0)

    async def _crawl_page(self, session: aiohttp.ClientSession, url: str, depth: int):
        import time

        try:
            self.profiler.start_page()
            logger.info(f"Crawling {url} (depth: {depth})")

            # ⏱️ TIMING: Fetch HTTP
            t0 = time.perf_counter()
            async with session.get(url, allow_redirects=True) as response:
                status_code = response.status
                content_type = response.headers.get("Content-Type", "")
                html = await response.text() if "text/html" in content_type else None
            self.profiler.record("1_http_fetch", time.perf_counter() - t0)

            if status_code == 403:
                logger.warning(f"🚫 403 Forbidden: {url}")
            elif status_code >= 400:
                logger.warning(f"❌ Error {status_code}: {url}")

            final_url = self._normalize_url(str(response.url))

            if final_url != url:
                logger.info(f"🔀 Redirect: {url} → {final_url}")
                self.url_redirects[url] = final_url

                redirect_data = {
                    "domain": urlparse(url).netloc,
                    "path": urlparse(url).path,
                    "status_code": 301,
                    "content_type": "redirect",
                }
                t0 = time.perf_counter()
                await self.db.create_or_update_page(url, redirect_data)
                await self.db.link_crawl_to_page(self.crawl_id, url, status_code=301)
                self.profiler.record("2_db_redirect", time.perf_counter() - t0)
                self.visited_urls.add(final_url)

            parsed_url = urlparse(final_url)
            page_data = PageData(
                url=final_url,
                status_code=status_code,
                domain=parsed_url.netloc,
                path=parsed_url.path,
                content_type=content_type,
            )

            if "text/html" in content_type and status_code == 200:
                # ⏱️ TIMING: Parse HTML
                t0 = time.perf_counter()
                soup = BeautifulSoup(html, "lxml")
                title_tag = soup.find("title")
                page_data.title = title_tag.string.strip() if title_tag else None
                for script in soup(["script", "style"]):
                    script.decompose()
                text_content = soup.get_text(separator=" ", strip=True)
                text_content_sample = text_content[:2000]
                self.profiler.record("2_html_parse", time.perf_counter() - t0)

                data_dict = page_data.dict()
                data_dict.pop("url", None)

                # ⏱️ TIMING: DB save (includes embedding)
                t0 = time.perf_counter()
                await self.db.create_or_update_page(final_url, data_dict, text_content=text_content_sample)
                self.profiler.record("3_db_save_page", time.perf_counter() - t0)

                # ⏱️ TIMING: DB link crawl
                t0 = time.perf_counter()
                await self.db.link_crawl_to_page(self.crawl_id, final_url, status_code=status_code)
                self.profiler.record("4_db_link_crawl", time.perf_counter() - t0)

                self.pages_crawled += 1

                # ⏱️ TIMING: WebSocket broadcast
                t0 = time.perf_counter()
                await self._broadcast_throttled({"type": "page_discovered", "data": page_data.dict()})
                self.profiler.record("5_ws_broadcast", time.perf_counter() - t0)

                if depth < self.max_depth:
                    # ⏱️ TIMING: Extract links
                    t0 = time.perf_counter()
                    await self._extract_links(soup, final_url, depth)
                    self.profiler.record("6_extract_links", time.perf_counter() - t0)

            else:
                # Page non-HTML (image, PDF, etc.) ou erreur
                data_dict = page_data.dict()
                data_dict.pop("url", None)
                t0 = time.perf_counter()
                await self.db.create_or_update_page(final_url, data_dict)
                await self.db.link_crawl_to_page(self.crawl_id, final_url, status_code=status_code)
                self.profiler.record("3_db_save_nonhtml", time.perf_counter() - t0)

                await self._broadcast_throttled({"type": "page_discovered", "data": page_data.dict()})

        except TimeoutError:
            logger.warning(f"⏱️  Timeout: {url}")
        except Exception as e:
            logger.error(f"❌ Error crawling {url}: {e}")

    async def _extract_links(self, soup: BeautifulSoup, current_url: str, current_depth: int):
        current_domain = urlparse(current_url).netloc
        normalized_current = self._normalize_url(current_url)

        for link_tag in soup.find_all("a", href=True):
            href = link_tag["href"]
            anchor_text = link_tag.get_text(strip=True)

            absolute_url = urljoin(current_url, href)
            absolute_url = absolute_url.split("#")[0]

            normalized_target = self._normalize_url(absolute_url)

            if normalized_target == normalized_current:
                continue

            if not self._should_crawl(absolute_url, current_domain):
                continue

            # Detect if link is structural (nav/footer) or content
            link_type = self._get_link_type(link_tag)

            # Use normalized URL for storage
            target_url = self.url_redirects.get(normalized_target, normalized_target)
            parsed_target = urlparse(target_url)

            await self.db.create_or_update_page(
                target_url,
                {
                    "domain": parsed_target.netloc,
                    "path": parsed_target.path,
                    "status_code": 0,
                    "title": anchor_text or f"Link from {urlparse(current_url).path}",
                },
            )
            # NOTE: On ne crée PAS la relation CRAWLED ici (découverte)
            # Elle sera créée avec le bon status_code quand la page sera crawlée

            await self.db.create_link(
                source_url=current_url,
                target_url=target_url,
                link_data={"anchor_text": anchor_text[:200], "crawl_id": self.crawl_id, "link_type": link_type},
            )
            self.links_found += 1

            self.pending_links.append((current_url, target_url))

            # ✅ Broadcast ALL links - Frontend will filter to show only crawled→crawled
            await self._broadcast_throttled(
                {
                    "type": "link_created",
                    "data": {"source": normalized_current, "target": target_url, "anchor": anchor_text[:50]},
                }
            )

            if target_url not in self.visited_urls:
                self._add_to_queue(target_url, current_depth + 1)

    async def _update_redirect_links(self):
        if not self.url_redirects:
            return

        logger.info(f"Updating {len(self.pending_links)} links for redirects...")

        processed_count = 0

        for source_url, target_url in self.pending_links:
            if target_url in self.url_redirects:
                final_target = self.url_redirects[target_url]

                await self.db.update_redirect_link(source_url, target_url, final_target, self.crawl_id)

                await self.manager.send_personal_message(
                    {
                        "type": "redirect_corrected",
                        "data": {"source": source_url, "old_target": target_url, "new_target": final_target},
                    },
                    self.crawl_id,
                )

                logger.info(f"Updated link: {source_url} → {target_url} → {final_target}")

                # Ta régulation existante (je l'ai laissée telle quelle)
                processed_count += 1
                if processed_count % 10 == 0:
                    await asyncio.sleep(1)

    def _should_crawl(self, urlTarget: str, urlSource_Domain: str) -> bool:
        parsed = urlparse(urlTarget)

        if parsed.scheme not in ("http", "https"):
            return False

        ignore_extensions = (".pdf", ".jpg", ".png", ".gif", ".zip", ".mp4", ".css", ".js")
        if parsed.path.lower().endswith(ignore_extensions):
            return False

        target_domain = parsed.netloc

        if self.crawl_mode == "INTERNAL":
            return target_domain == self.root_domain
        elif self.crawl_mode == "EXTERNAL":
            if urlSource_Domain is None:
                urlSource_Domain = self.root_domain
            return target_domain != urlSource_Domain
        elif self.crawl_mode == "ALL":
            return True

        return False

    async def _finalize_crawl(self):
        await self.db.finalize_crawl(self.crawl_id, self.pages_crawled, self.links_found)

        await self.manager.broadcast(
            self.crawl_id,
            {
                "type": "crawl_completed",
                "data": {"pages_crawled": self.pages_crawled, "pages_discovered": 0, "links_found": self.links_found},
            },
        )
