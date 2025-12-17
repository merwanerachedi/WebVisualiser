# backend/app/crawler.py
import asyncio
import aiohttp
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
from typing import Set, Dict, Optional, Literal, List
import logging
from datetime import datetime
from collections import deque
from fake_useragent import UserAgent

from .database import Neo4jDatabase
from .websocket import ConnectionManager
from .models import PageData, LinkData

logger = logging.getLogger(__name__)

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
        algorithm: Literal["BFS", "DFS"] = "BFS"
    ):
        self.crawl_id = crawl_id
        self.root_url = root_url
        self.max_depth = max_depth
        self.max_pages = max_pages
        self.db = db
        self.manager = manager
        self.crawl_mode = crawl_mode
        self.algorithm = algorithm
        
        self.visited_urls: Set[str] = set()
        self.pages_crawled = 0
        self.links_found = 0
        
        # Tracker les redirections
        self.url_redirects: Dict[str, str] = {}
        self.pending_links: List[tuple] = []
        
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

    def _get_headers(self):
        """Génère des headers aléatoires (Mode Ninja)"""
        return {
            'User-Agent': self.ua.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }

    @staticmethod
    def _normalize_url(url: str) -> str:
        parsed = urlparse(url)
        path = parsed.path.rstrip('/') if parsed.path != '/' else '/'
        normalized = urlunparse((
            parsed.scheme,
            parsed.netloc.lower(),
            path,
            '', 
            parsed.query,
            '' 
        ))
        return normalized
    
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
        logger.info(f"Crawl {self.crawl_id} completed. Pages: {self.pages_crawled}, Links: {self.links_found}")
    
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
        try:
            logger.info(f"Crawling {url} (depth: {depth})")
            
            async with session.get(url, allow_redirects=True) as response:
                status_code = response.status
                content_type = response.headers.get('Content-Type', '')

                if status_code == 403:
                    logger.warning(f"🚫 403 Forbidden: {url}")
                elif status_code >= 400:
                    logger.warning(f"❌ Error {status_code}: {url}")
                
                final_url = str(response.url)
                
                if final_url != url:
                    logger.info(f"🔀 Redirect: {url} → {final_url}")
                    self.url_redirects[url] = final_url
                    
                    redirect_data = {
                        "domain": urlparse(url).netloc,
                        "path": urlparse(url).path,
                        "status_code": 301,
                        "content_type": "redirect"
                    }
                    await self.db.create_or_update_page(url, redirect_data)
                    self.visited_urls.add(final_url)
                
                parsed_url = urlparse(final_url)
                page_data = PageData(
                    url=final_url,
                    status_code=status_code,
                    domain=parsed_url.netloc,
                    path=parsed_url.path,
                    content_type=content_type
                )
                
                if 'text/html' in content_type and status_code == 200:
                    html = await response.text()
                    soup = BeautifulSoup(html, 'lxml')
                    
                    title_tag = soup.find('title')
                    page_data.title = title_tag.string.strip() if title_tag else None
                    
                    for script in soup(["script", "style"]):
                        script.decompose()
                    
                    text_content = soup.get_text(separator=' ', strip=True)
                    text_content_sample = text_content[:2000] 

                    data_dict = page_data.dict()
                    data_dict.pop('url', None)
                    
                    await self.db.create_or_update_page(final_url, data_dict, text_content=text_content_sample)
                    
                    self.pages_crawled += 1
                    
                    # ✅ UTILISATION DU THROTTLING
                    await self._broadcast_throttled({
                        "type": "page_discovered",
                        "data": page_data.dict()
                    })
                    
                    if depth < self.max_depth:
                        await self._extract_links(soup, final_url, depth)
                
                else:
                    data_dict = page_data.dict()
                    data_dict.pop('url', None)
                    await self.db.create_or_update_page(final_url, data_dict)
                    
                    # ✅ UTILISATION DU THROTTLING
                    await self._broadcast_throttled({
                        "type": "page_discovered",
                        "data": page_data.dict()
                    })
        
        except asyncio.TimeoutError:
            logger.warning(f"⏱️  Timeout: {url}")
        except Exception as e:
            logger.error(f"❌ Error crawling {url}: {e}")
    
    async def _extract_links(self, soup: BeautifulSoup, current_url: str, current_depth: int):
        current_domain = urlparse(current_url).netloc
        normalized_current = self._normalize_url(current_url)

        for link_tag in soup.find_all('a', href=True):
            href = link_tag['href']
            anchor_text = link_tag.get_text(strip=True)
            
            absolute_url = urljoin(current_url, href)
            absolute_url = absolute_url.split('#')[0]

            normalized_target = self._normalize_url(absolute_url)
            
            if normalized_target == normalized_current:
                continue
            
            if not self._should_crawl(absolute_url, current_domain):
                continue

            target_url = self.url_redirects.get(absolute_url, absolute_url)
            parsed_target = urlparse(target_url)
            
            await self.db.create_or_update_page(target_url, {
                "domain": parsed_target.netloc,
                "path": parsed_target.path,
                "status_code": 0,
                "title": anchor_text or f"Link from {urlparse(current_url).path}"
                })
            
            await self.db.create_link(
                source_url=current_url,
                target_url=target_url,
                link_data={
                    "anchor_text": anchor_text[:200],
                    "crawl_id": self.crawl_id
                }
            )
            self.links_found += 1
            
            self.pending_links.append((current_url, absolute_url))
            
            # ✅ UTILISATION DU THROTTLING (Critique pour les liens)
            await self._broadcast_throttled({
                "type": "link_created",
                "data": {
                    "source": current_url,
                    "target": absolute_url,
                    "anchor": anchor_text[:50]
                }
            })
            
            if absolute_url not in self.visited_urls:
                self._add_to_queue(absolute_url, current_depth + 1)
    
    async def _update_redirect_links(self):
        if not self.url_redirects:
            return
        
        logger.info(f"Updating {len(self.pending_links)} links for redirects...")
        
        processed_count = 0
        
        for source_url, target_url in self.pending_links:
            if target_url in self.url_redirects:
                final_target = self.url_redirects[target_url]
                
                await self.db.update_redirect_link(source_url, target_url, final_target, self.crawl_id)

                await self.manager.send_personal_message({
                    "type": "redirect_corrected",
                    "data": {
                        "source": source_url,
                        "old_target": target_url,
                        "new_target": final_target
                    }
                }, self.crawl_id)
                
                logger.info(f"Updated link: {source_url} → {target_url} → {final_target}")
                
                # Ta régulation existante (je l'ai laissée telle quelle)
                processed_count += 1
                if processed_count % 10 == 0:
                    await asyncio.sleep(1)

    def _should_crawl(self, urlTarget: str, urlSource_Domain: str) -> bool:
        parsed = urlparse(urlTarget)
        
        if parsed.scheme not in ('http', 'https'):
            return False
        
        ignore_extensions = ('.pdf', '.jpg', '.png', '.gif', '.zip', '.mp4', '.css', '.js')
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
        
        await self.manager.broadcast(self.crawl_id, {
            "type": "crawl_completed",
            "data": {
                "pages_crawled": self.pages_crawled,
                "pages_discovered": 0, 
                "links_found": self.links_found
            }
        })