# backend/app/database.py
import logging
import os

from dotenv import load_dotenv
from neo4j import AsyncGraphDatabase
from sentence_transformers import SentenceTransformer  # 👈 IMPORT IA

load_dotenv()

logger = logging.getLogger(__name__)


class Neo4jDatabase:
    def __init__(self):
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASSWORD")

        if not password:
            logger.error("❌ CRITIQUE : Variable NEO4J_PASSWORD introuvable dans le fichier .env !")
            raise ValueError("NEO4J_PASSWORD is missing from .env file")

        self.driver = AsyncGraphDatabase.driver(uri, auth=(user, password))

        # ✅ CHARGEMENT DU MODÈLE IA (Se fait une seule fois au démarrage)
        logger.info("🧠 Chargement du modèle d'embedding (ça peut prendre quelques secondes)...")
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("🧠 Modèle chargé et prêt !")

    async def verify_connection(self):
        """Vérifie que la connexion fonctionne au démarrage"""
        try:
            logger.info("Verifying Neo4j connection...")
            await self.driver.verify_connectivity()
            await self._setup_constraints()
            logger.info("✅ Neo4j connection established and verified.")
        except Exception as e:
            logger.error(f"❌ Failed to connect to Neo4j: {e}")
            raise e

    async def _setup_constraints(self):
        async with self.driver.session() as session:
            await session.run("CREATE CONSTRAINT page_url_unique IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE")
            await session.run(
                "CREATE CONSTRAINT crawl_id_unique IF NOT EXISTS FOR (c:Crawl) REQUIRE c.crawl_id IS UNIQUE"
            )
            await session.run(
                "CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE"
            )
            await session.run("CREATE INDEX page_domain IF NOT EXISTS FOR (p:Page) ON (p.domain)")

            # Note: L'index vectoriel doit être créé manuellement (ce que tu as déjà fait)

    # ========== USER METHODS ==========

    async def create_user(self, user_id: str, email: str, password_hash: str):
        """Create a new user in the database."""
        async with self.driver.session() as session:
            query = """
                CREATE (u:User {
                    user_id: $user_id,
                    email: $email,
                    password_hash: $password_hash,
                    created_at: datetime()
                })
                RETURN u.user_id as user_id, u.email as email, u.created_at as created_at
            """
            result = await session.run(query, user_id=user_id, email=email, password_hash=password_hash)
            record = await result.single()
            if record:
                return {
                    "user_id": record["user_id"],
                    "email": record["email"],
                    "created_at": record["created_at"].to_native(),
                }
            return None

    async def get_user_by_email(self, email: str):
        """Get a user by their email address."""
        async with self.driver.session() as session:
            query = """
                MATCH (u:User {email: $email})
                RETURN u.user_id as user_id, u.email as email,
                       u.password_hash as password_hash, u.created_at as created_at
            """
            result = await session.run(query, email=email)
            record = await result.single()
            if record:
                return {
                    "user_id": record["user_id"],
                    "email": record["email"],
                    "password_hash": record["password_hash"],
                    "created_at": record["created_at"].to_native(),
                }
            return None

    async def get_user_by_id(self, user_id: str):
        """Get a user by their ID."""
        async with self.driver.session() as session:
            query = """
                MATCH (u:User {user_id: $user_id})
                RETURN u.user_id as user_id, u.email as email, u.created_at as created_at
            """
            result = await session.run(query, user_id=user_id)
            record = await result.single()
            if record:
                return {
                    "user_id": record["user_id"],
                    "email": record["email"],
                    "created_at": record["created_at"].to_native(),
                }
            return None

    async def get_user_crawls(self, user_id: str):
        """Get all crawls for a specific user."""
        async with self.driver.session() as session:
            query = """
                MATCH (u:User {user_id: $user_id})-[:OWNS]->(c:Crawl)
                RETURN c.crawl_id as crawl_id, c.root_url as root_url, c.status as status,
                       c.started_at as started_at, c.completed_at as completed_at,
                       c.pages_crawled as pages_crawled, c.links_found as links_found,
                       c.crawl_mode as crawl_mode, c.algorithm as algorithm
                ORDER BY c.started_at DESC
            """
            result = await session.run(query, user_id=user_id)
            crawls = []
            async for record in result:
                crawls.append(
                    {
                        "crawl_id": record["crawl_id"],
                        "root_url": record["root_url"],
                        "status": record["status"],
                        "started_at": record["started_at"].to_native() if record["started_at"] else None,
                        "completed_at": record["completed_at"].to_native() if record["completed_at"] else None,
                        "pages_crawled": record["pages_crawled"] or 0,
                        "links_found": record["links_found"] or 0,
                        "crawl_mode": record["crawl_mode"] or "INTERNAL",
                        "algorithm": record["algorithm"] or "BFS",
                    }
                )
            return crawls

    async def delete_crawl(self, crawl_id: str, user_id: str):
        """Delete a crawl and verify ownership."""
        async with self.driver.session() as session:
            # First verify ownership
            check_query = """
                MATCH (u:User {user_id: $user_id})-[:OWNS]->(c:Crawl {crawl_id: $crawl_id})
                RETURN c
            """
            check_result = await session.run(check_query, user_id=user_id, crawl_id=crawl_id)
            if not await check_result.single():
                return False

            # Delete crawl and its relationships
            delete_query = """
                MATCH (c:Crawl {crawl_id: $crawl_id})
                OPTIONAL MATCH (c)-[r:CRAWLED]->(p:Page)
                DELETE r, c
            """
            await session.run(delete_query, crawl_id=crawl_id)
            return True

    async def create_crawl(
        self,
        crawl_id: str,
        root_url: str,
        max_depth: int = 3,
        user_id: str = None,
        crawl_mode: str = "INTERNAL",
        algorithm: str = "BFS",
    ):
        async with self.driver.session() as session:
            # Create crawl node
            query = """
                CREATE (c:Crawl {
                    crawl_id: $crawl_id,
                    root_url: $root_url,
                    started_at: datetime(),
                    status: 'running',
                    max_depth: $max_depth,
                    pages_crawled: 0,
                    links_found: 0,
                    crawl_mode: $crawl_mode,
                    algorithm: $algorithm
                })
                RETURN c
            """
            result = await session.run(
                query,
                crawl_id=crawl_id,
                root_url=root_url,
                max_depth=max_depth,
                crawl_mode=crawl_mode,
                algorithm=algorithm,
            )
            crawl = await result.single()

            # If user is logged in, create OWNS relationship
            if user_id:
                await session.run(
                    """
                    MATCH (u:User {user_id: $user_id}), (c:Crawl {crawl_id: $crawl_id})
                    CREATE (u)-[:OWNS]->(c)
                    """,
                    user_id=user_id,
                    crawl_id=crawl_id,
                )

            return crawl

    # ✅ MODIFICATION : On ajoute un argument optionnel "text_content"
    async def create_or_update_page(self, url: str, page_data: dict, text_content: str = None):
        """Créer ou mettre à jour une page avec son vecteur"""

        # 1. Calcul du vecteur si on a du texte
        embedding = None
        if text_content:
            try:
                # .tolist() est important car Neo4j ne comprend pas les formats Numpy
                embedding = self.model.encode(text_content).tolist()
            except Exception as e:
                logger.error(f"Erreur vectorisation pour {url}: {e}")

        async with self.driver.session() as session:
            query = """
                MERGE (p:Page {url: $url})
                ON CREATE SET
                    p.domain = $domain,
                    p.path = $path,
                    p.title = $title,
                    p.status_code = $status_code,
                    p.content_type = $content_type,
                    p.embedding = $embedding,  // 👈 On stocke le vecteur
                    p.created_at = datetime(),
                    p.last_crawled_at = datetime(),
                    p.crawl_count = 1
                ON MATCH SET
                    p.title = CASE WHEN $title IS NOT NULL THEN $title ELSE p.title END,
                    p.status_code = CASE WHEN $status_code IS NOT NULL THEN $status_code ELSE p.status_code END,
                    p.embedding = CASE WHEN $embedding IS NOT NULL THEN $embedding ELSE p.embedding END, // 👈 Mise à jour vecteur
                    p.last_crawled_at = datetime(),
                    p.crawl_count = p.crawl_count + 1
                RETURN p
            """

            params = {
                "url": url,
                "domain": page_data.get("domain"),
                "path": page_data.get("path"),
                "title": page_data.get("title"),
                "status_code": page_data.get("status_code"),
                "content_type": page_data.get("content_type"),
                "embedding": embedding,  # Peut être None, c'est pas grave
            }

            result = await session.run(query, **params)
            return await result.single()

    async def create_link(self, source_url: str, target_url: str, link_data: dict):
        # (Garde ton code précédent ici)
        async with self.driver.session() as session:
            # ... (code identique à avant) ...
            check_query = "OPTIONAL MATCH (source:Page {url: $source_url}) OPTIONAL MATCH (target:Page {url: $target_url}) RETURN source.url as source_exists, target.url as target_exists"
            check_res = await session.run(check_query, source_url=source_url, target_url=target_url)
            check = await check_res.single()
            if not check or not check["source_exists"]:
                return

            query = """
                MATCH (source:Page {url: $source_url})
                MATCH (target:Page {url: $target_url})
                MERGE (source)-[r:LINKS_TO]->(target)
                ON CREATE SET r.anchor_text = $anchor_text, r.discovered_at = datetime(), r.crawl_id = $crawl_id
            """
            await session.run(query, source_url=source_url, target_url=target_url, **link_data)

    async def link_crawl_to_page(self, crawl_id: str, page_url: str):
        """
        Crée la relation [:CRAWLED] entre un Crawl et une Page.
        Cette relation permet de savoir quelles pages appartiennent à quel crawl.
        """
        async with self.driver.session() as session:
            query = """
                MATCH (c:Crawl {crawl_id: $crawl_id})
                MATCH (p:Page {url: $page_url})
                MERGE (c)-[:CRAWLED]->(p)
            """
            await session.run(query, crawl_id=crawl_id, page_url=page_url)

    async def update_redirect_link(self, source_url, old_target, final_target, crawl_id):
        # (Garde ton code précédent ici)
        async with self.driver.session() as session:
            await session.run(
                "MATCH (source:Page {url: $source_url})-[old:LINKS_TO]->(target:Page {url: $old_target}) DELETE old",
                source_url=source_url,
                old_target=old_target,
            )
            await session.run(
                """
                MATCH (source:Page {url: $source_url})
                MATCH (target:Page {url: $final_target})
                MERGE (source)-[r:LINKS_TO]->(target)
                ON CREATE SET r.crawl_id = $crawl_id, r.was_redirected = true, r.original_url = $old_target
            """,
                source_url=source_url,
                final_target=final_target,
                old_target=old_target,
                crawl_id=crawl_id,
            )

    async def finalize_crawl(self, crawl_id, pages_crawled, links_found):
        # (Garde ton code précédent ici)
        async with self.driver.session() as session:
            stats = await session.run(
                "MATCH (p:Page) RETURN sum(CASE WHEN p.status_code > 0 THEN 1 ELSE 0 END) as real_pages, sum(CASE WHEN p.status_code = 0 THEN 1 ELSE 0 END) as discovered"
            )
            record = await stats.single()
            await session.run(
                "MATCH (c:Crawl {crawl_id: $crawl_id}) SET c.completed_at = datetime(), c.status = 'completed', c.pages_crawled = $pc, c.pages_discovered = $pd, c.links_found = $lf",
                crawl_id=crawl_id,
                pc=record["real_pages"],
                pd=record["discovered"],
                lf=links_found,
            )

    async def get_crawl_graph(self, crawl_id: str):
        """Récupère le graphe d'un crawl en filtrant les pages de redirection."""
        async with self.driver.session() as session:
            # Filtrer les pages avec content_type = 'redirect'
            query = """
                MATCH (c:Crawl {crawl_id: $crawl_id})-[:CRAWLED]->(p:Page)
                WHERE p.status_code <> 301
                OPTIONAL MATCH (p)-[r:LINKS_TO]->(target:Page)
                WHERE target.status_code <> 301
                RETURN p, r, target
            """
            result = await session.run(query, crawl_id=crawl_id)
            nodes = []
            edges = []
            seen_nodes = set()
            async for record in result:
                page = record["p"]
                if page["url"] not in seen_nodes:
                    nodes.append(
                        {
                            "id": page["url"],
                            "label": page.get("title", page["url"]),
                            "status": page.get("status_code", 0),
                        }
                    )
                    seen_nodes.add(page["url"])
                if record["r"] and record["target"]:
                    target = record["target"]
                    if target["url"] not in seen_nodes:
                        nodes.append(
                            {
                                "id": target["url"],
                                "label": target.get("title", target["url"]),
                                "status": target.get("status_code", 0),
                            }
                        )
                        seen_nodes.add(target["url"])
                    edges.append({"source": page["url"], "target": target["url"]})
            return {"nodes": nodes, "edges": edges}

    # ✅ NOUVELLE MÉTHODE : RECHERCHE SÉMANTIQUE
    async def search_similar_pages(self, user_query: str, top_k: int = 5):
        """Cherche les pages les plus pertinentes par rapport à une question"""
        # 1. On transforme la question de l'utilisateur en vecteur
        query_embedding = self.model.encode(user_query).tolist()

        async with self.driver.session() as session:
            # 2. On interroge l'index vectoriel de Neo4j
            query = """
                CALL db.index.vector.queryNodes('page_embeddings', $k, $embedding)
                YIELD node, score
                RETURN node.url as url, node.title as title, score
            """
            result = await session.run(query, k=top_k, embedding=query_embedding)

            results = []
            async for record in result:
                results.append({"url": record["url"], "title": record["title"], "score": record["score"]})
            return results

    # ========== PAGE SUMMARIZATION METHODS ==========

    async def get_page_summary(self, url: str) -> str | None:
        """Récupère le résumé en cache d'une page."""
        async with self.driver.session() as session:
            result = await session.run(
                "MATCH (p:Page {url: $url}) RETURN p.summary as summary",
                url=url,
            )
            record = await result.single()
            return record["summary"] if record and record["summary"] else None

    async def save_page_summary(self, url: str, summary: str):
        """Sauvegarde le résumé d'une page en cache."""
        async with self.driver.session() as session:
            await session.run(
                "MATCH (p:Page {url: $url}) SET p.summary = $summary",
                url=url,
                summary=summary,
            )

    async def close(self):
        await self.driver.close()


# Singleton
db = Neo4jDatabase()
