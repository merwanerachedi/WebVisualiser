# backend/app/database.py
from neo4j import GraphDatabase
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class Neo4jDatabase:
    def __init__(self, uri: str, user: str, password: str):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        self._setup_constraints()
    
    def _setup_constraints(self):
        """Créer les contraintes et index Neo4j"""
        with self.driver.session() as session:
            # Contrainte unicité URL
            session.run("""
                CREATE CONSTRAINT page_url_unique IF NOT EXISTS
                FOR (p:Page) REQUIRE p.url IS UNIQUE
            """)
            
            # Contrainte unicité crawl_id
            session.run("""
                CREATE CONSTRAINT crawl_id_unique IF NOT EXISTS
                FOR (c:Crawl) REQUIRE c.crawl_id IS UNIQUE
            """)
            
            # Index pour recherches fréquentes
            session.run("""
                CREATE INDEX page_domain IF NOT EXISTS
                FOR (p:Page) ON (p.domain)
            """)
            
            session.run("""
                CREATE INDEX page_status IF NOT EXISTS
                FOR (p:Page) ON (p.status_code)
            """)
            
            logger.info("Neo4j constraints and indexes created")
    
    def create_crawl(self, crawl_id: str, root_url: str, max_depth: int = 3):
        """Créer une nouvelle session de crawl"""
        with self.driver.session() as session:
            result = session.run("""
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
            """, crawl_id=crawl_id, root_url=root_url, max_depth=max_depth)
            return result.single()
    
    def create_or_update_page(self, url: str, page_data: dict):
        """Créer ou mettre à jour une page"""
        with self.driver.session() as session:
            result = session.run("""
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
            """, 
            url=url,
            domain=page_data.get("domain"),
            path=page_data.get("path"),
            title=page_data.get("title"),
            status_code=page_data.get("status_code"),
            content_type=page_data.get("content_type")
            )
            return result.single()
    
    # backend/app/database.py

    def create_link(self, source_url: str, target_url: str, link_data: dict):
        """Créer un lien entre deux pages"""
        
        # ✅ LOGS DÉTAILLÉS
        logger.info(f"🔗 CREATE_LINK called:")
        logger.info(f"   Source: {source_url}")
        logger.info(f"   Target: {target_url}")
        logger.info(f"   Anchor: {link_data.get('anchor_text', 'N/A')[:50]}")
        
        with self.driver.session() as session:
            # Vérifier que les pages existent
            check = session.run("""
                OPTIONAL MATCH (source:Page {url: $source_url})
                OPTIONAL MATCH (target:Page {url: $target_url})
                RETURN source.url as source_exists, target.url as target_exists
            """, source_url=source_url, target_url=target_url).single()
            
            if not check["source_exists"]:
                logger.error(f"❌ SOURCE PAGE NOT FOUND: {source_url}")
                return
            
            if not check["target_exists"]:
                logger.warning(f"⚠️  TARGET PAGE NOT FOUND (will be created later): {target_url}")
                # C'est normal si la page n'est pas encore crawlée
            
            # Créer le lien
            session.run("""
                MATCH (source:Page {url: $source_url})
                MATCH (target:Page {url: $target_url})
                MERGE (source)-[r:LINKS_TO]->(target)
                ON CREATE SET
                    r.anchor_text = $anchor_text,
                    r.discovered_at = datetime(),
                    r.crawl_id = $crawl_id
            """, source_url=source_url, target_url=target_url, **link_data)
            
            # Vérifier que le lien a bien été créé
            verify = session.run("""
                MATCH (source:Page {url: $source_url})-[r:LINKS_TO]->(target:Page {url: $target_url})
                RETURN count(r) as link_count
            """, source_url=source_url, target_url=target_url).single()
            
            logger.info(f"✅ Link count after creation: {verify['link_count']}")
    
    def get_crawl_graph(self, crawl_id: str):
        """Récupérer le graphe d'un crawl"""
        with self.driver.session() as session:
            result = session.run("""
                MATCH (c:Crawl {crawl_id: $crawl_id})-[:CRAWLED]->(p:Page)
                OPTIONAL MATCH (p)-[r:LINKS_TO]->(target:Page)
                RETURN p, r, target
            """, crawl_id=crawl_id)
            
            nodes = []
            edges = []
            seen_nodes = set()
            
            for record in result:
                page = record["p"]
                if page["url"] not in seen_nodes:
                    nodes.append({
                        "id": page["url"],
                        "label": page["title"] or page["url"],
                        "status": page["status_code"]
                    })
                    seen_nodes.add(page["url"])
                
                if record["r"] and record["target"]:
                    target = record["target"]
                    if target["url"] not in seen_nodes:
                        nodes.append({
                            "id": target["url"],
                            "label": target["title"] or target["url"],
                            "status": target["status_code"]
                        })
                        seen_nodes.add(target["url"])
                    
                    edges.append({
                        "source": page["url"],
                        "target": target["url"]
                    })
            
            return {"nodes": nodes, "edges": edges}
    
    def close(self):
        self.driver.close()

# Singleton
db = Neo4jDatabase(
    uri="bolt://neo4j:7687",
    user="neo4j",
    password="password123"
)