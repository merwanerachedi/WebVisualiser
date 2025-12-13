# backend/app/database.py
import os
from neo4j import AsyncGraphDatabase
from dotenv import load_dotenv
import logging
import asyncio

# Charge les variables du fichier .env
load_dotenv()

logger = logging.getLogger(__name__)

class Neo4jDatabase:
    def __init__(self):
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASSWORD")
        
        # ✅ Utilisation du driver ASYNC
        self.driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    
    async def verify_connection(self):
        """Vérifie que la connexion fonctionne au démarrage"""
        try:
            logger.info("Verifying Neo4j connection...")
            await self.driver.verify_connectivity()
            # On lance les contraintes en async
            await self._setup_constraints()
            logger.info("✅ Neo4j connection established and verified.")
        except Exception as e:
            logger.error(f"❌ Failed to connect to Neo4j: {e}")
            raise e

    async def _setup_constraints(self):
        """Créer les contraintes et index Neo4j (Async)"""
        async with self.driver.session() as session:
            # Contraintes
            await session.run("CREATE CONSTRAINT page_url_unique IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE")
            await session.run("CREATE CONSTRAINT crawl_id_unique IF NOT EXISTS FOR (c:Crawl) REQUIRE c.crawl_id IS UNIQUE")
            # Index
            await session.run("CREATE INDEX page_domain IF NOT EXISTS FOR (p:Page) ON (p.domain)")
            await session.run("CREATE INDEX page_status IF NOT EXISTS FOR (p:Page) ON (p.status_code)")
            
    async def create_crawl(self, crawl_id: str, root_url: str, max_depth: int = 3):
        """Créer une nouvelle session de crawl"""
        async with self.driver.session() as session:
            query = """
                CREATE (c:Crawl {
                    crawl_id: $crawl_id,
                    root_url: $root_url,
                    started_at: datetime(),
                    status: 'running',
                    max_depth: $max_depth,
                    pages_crawled: 0,
                    links_found: 0
                })
                RETURN c
            """
            result = await session.run(query, crawl_id=crawl_id, root_url=root_url, max_depth=max_depth)
            return await result.single()
    
    async def create_or_update_page(self, url: str, page_data: dict):
        """Créer ou mettre à jour une page"""
        async with self.driver.session() as session:
            query = """
                MERGE (p:Page {url: $url})
                ON CREATE SET
                    p.domain = $domain,
                    p.path = $path, 
                    p.title = $title,
                    p.status_code = $status_code,
                    p.content_type = $content_type,
                    p.created_at = datetime(),
                    p.last_crawled_at = datetime(),
                    p.crawl_count = 1
                ON MATCH SET
                    p.title = $title,
                    p.status_code = $status_code,
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
                "content_type": page_data.get("content_type") 
                    }
            
            result = await session.run(query, **params)
            return await result.single()

    async def create_link(self, source_url: str, target_url: str, link_data: dict):
        """Créer un lien entre deux pages"""
        async with self.driver.session() as session:
            # Vérifier existence (Optimisation: on le fait dans la même requête MERGE si possible, 
            # mais ici on garde ta logique de vérification pour les logs)
            
            check_query = """
                OPTIONAL MATCH (source:Page {url: $source_url})
                OPTIONAL MATCH (target:Page {url: $target_url})
                RETURN source.url as source_exists, target.url as target_exists
            """
            check_res = await session.run(check_query, source_url=source_url, target_url=target_url)
            check = await check_res.single()
            
            if not check or not check["source_exists"]:
                logger.warning(f"⚠️ Link creation skipped: Source {source_url} not found")
                return

            query = """
                MATCH (source:Page {url: $source_url})
                MATCH (target:Page {url: $target_url})
                MERGE (source)-[r:LINKS_TO]->(target)
                ON CREATE SET
                    r.anchor_text = $anchor_text,
                    r.discovered_at = datetime(),
                    r.crawl_id = $crawl_id
            """
            await session.run(query, source_url=source_url, target_url=target_url, **link_data)

    async def update_redirect_link(self, source_url, old_target, final_target, crawl_id):
        """Mise à jour spécifique pour les redirections"""
        async with self.driver.session() as session:
            # Supprimer l'ancien lien
            await session.run("""
                MATCH (source:Page {url: $source_url})-[old:LINKS_TO]->(target:Page {url: $old_target})
                DELETE old
            """, source_url=source_url, old_target=old_target)
            
            # Créer le nouveau
            await session.run("""
                MATCH (source:Page {url: $source_url})
                MATCH (target:Page {url: $final_target})
                MERGE (source)-[r:LINKS_TO]->(target)
                ON CREATE SET
                    r.crawl_id = $crawl_id,
                    r.was_redirected = true,
                    r.original_url = $old_target
            """, source_url=source_url, final_target=final_target, old_target=old_target, crawl_id=crawl_id)

    async def finalize_crawl(self, crawl_id, pages_crawled, links_found):
        async with self.driver.session() as session:
            # Stats calculées en DB
            stats_query = """
                MATCH (p:Page)
                RETURN 
                    sum(CASE WHEN p.status_code > 0 THEN 1 ELSE 0 END) as real_pages,
                    sum(CASE WHEN p.status_code = 0 THEN 1 ELSE 0 END) as discovered
            """
            res = await session.run(stats_query)
            record = await res.single()
            
            update_query = """
                MATCH (c:Crawl {crawl_id: $crawl_id})
                SET c.completed_at = datetime(),
                    c.status = 'completed',
                    c.pages_crawled = $pc,
                    c.pages_discovered = $pd,
                    c.links_found = $lf
            """
            await session.run(update_query, crawl_id=crawl_id, pc=record['real_pages'], pd=record['discovered'], lf=links_found)

    async def get_crawl_graph(self, crawl_id: str):
        """Récupérer le graphe"""
        async with self.driver.session() as session:
            result = await session.run("""
                MATCH (c:Crawl {crawl_id: $crawl_id})-[:CRAWLED]->(p:Page)
                OPTIONAL MATCH (p)-[r:LINKS_TO]->(target:Page)
                RETURN p, r, target
            """, crawl_id=crawl_id)
            
            nodes = []
            edges = []
            seen_nodes = set()
            
            # Async iterator
            async for record in result:
                page = record["p"]
                if page["url"] not in seen_nodes:
                    nodes.append({
                        "id": page["url"],
                        "label": page.get("title", page["url"]),
                        "status": page.get("status_code", 0)
                    })
                    seen_nodes.add(page["url"])
                
                if record["r"] and record["target"]:
                    target = record["target"]
                    if target["url"] not in seen_nodes:
                        nodes.append({
                            "id": target["url"],
                            "label": target.get("title", target["url"]),
                            "status": target.get("status_code", 0)
                        })
                        seen_nodes.add(target["url"])
                    
                    edges.append({
                        "source": page["url"],
                        "target": target["url"]
                    })
            
            return {"nodes": nodes, "edges": edges}
    
    async def close(self):
        await self.driver.close()

# Singleton
db = Neo4jDatabase()