# backend/app/main.py
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uuid
from datetime import datetime
from typing import Dict
import asyncio
import logging
import traceback

from .models import CrawlRequest, CrawlResponse
from .database import db
from .crawler import WebCrawler
from .websocket import ConnectionManager

# Configuration des logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Web Crawler API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket manager
manager = ConnectionManager()

# Store crawler configurations (not started yet)
pending_crawls: Dict[str, dict] = {}

# Store active crawlers
active_crawlers: Dict[str, WebCrawler] = {}

@app.get("/")
async def root():
    return {"message": "Web Crawler API", "version": "1.0.0"}

@app.post("/api/crawl", response_model=CrawlResponse)
async def create_crawl(request: CrawlRequest):
    crawl_id = str(uuid.uuid4())
    root_url = str(request.url)
    
    # Créer l'enregistrement dans Neo4j (status: 'pending')
    try:
        db.create_crawl(crawl_id, root_url, request.max_depth)
    except Exception as e:
        logger.error(f"❌ Erreur DB lors de la création du crawl: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    # Stocker la configuration (pas encore démarré)
    pending_crawls[crawl_id] = {
        "root_url": root_url,
        "max_depth": request.max_depth,
        "max_pages": request.max_pages,
        "crawl_mode": request.crawl_mode,
        "algorithm": request.algorithm,
    }
    
    logger.info(f"✅ Crawl {crawl_id} created (pending WebSocket connection)")
    
    return CrawlResponse(
        crawl_id=crawl_id,
        status="pending",
        root_url=root_url,
        started_at=datetime.now(),
        crawl_mode=request.crawl_mode,
        algorithm=request.algorithm
    )

@app.websocket("/ws/{crawl_id}")
async def websocket_endpoint(websocket: WebSocket, crawl_id: str):
    await manager.connect(crawl_id, websocket)
    logger.info(f"✅ WebSocket client connected for crawl {crawl_id}")
    
    try:
        if crawl_id in pending_crawls:
            config = pending_crawls.pop(crawl_id)
            
            logger.info(f"🚀 Initializing crawler for {crawl_id}...")
            
            crawler = WebCrawler(
                crawl_id=crawl_id,
                root_url=config["root_url"],
                max_depth=config["max_depth"],
                max_pages=config["max_pages"],
                db=db,
                manager=manager,
                crawl_mode=config["crawl_mode"],
                algorithm=config["algorithm"]
            )
            
            active_crawlers[crawl_id] = crawler
            
            # --- WRAPPER POUR CAPTURER LES ERREURS DU CRAWLER ---
            async def run_crawl_wrapper():
                try:
                    logger.info(f"▶️ Starting crawler process for {crawl_id}")
                    await crawler.start()
                    logger.info(f"🏁 Crawl {crawl_id} finished successfully")
                    
                    # ✅ AJOUT : Signaler au frontend que c'est fini
                    await manager.send_personal_message(
                        {"type": "crawl_completed", "data": {"crawl_id": crawl_id}}, 
                        crawl_id
                    )

                except Exception as e:
                    error_msg = f"❌ CRITICAL CRAWLER ERROR: {str(e)}"
                    logger.error(error_msg)
                    traceback.print_exc()
                    try:
                        await manager.send_personal_message(
                            {"type": "error", "message": error_msg}, 
                            crawl_id
                        )
                    except:
                        pass

            # Lancer le crawl en arrière-plan via le wrapper
            asyncio.create_task(run_crawl_wrapper())
            
        else:
            logger.warning(f"⚠️ Crawl {crawl_id} not found in pending crawls (or already started)")
        
        # Boucle pour garder la connexion ouverte
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
                logger.info(f"📩 Received from client: {data}")
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.warning(f"Connection closed or error: {e}")
                break
                
    except WebSocketDisconnect:
        manager.disconnect(crawl_id, websocket)
        logger.info(f"WebSocket disconnected for crawl {crawl_id}")
    except Exception as e:
        logger.error(f"Error in WebSocket endpoint: {e}")
        manager.disconnect(crawl_id, websocket)

@app.get("/api/crawl/{crawl_id}/graph")
async def get_crawl_graph(crawl_id: str):
    graph = db.get_crawl_graph(crawl_id)
    return graph

@app.on_event("shutdown")
async def shutdown_event():
    db.close()