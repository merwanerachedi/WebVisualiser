# backend/app/main.py
# (Imports existants...)
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uuid
import asyncio
import logging
import traceback
from datetime import datetime

from .models import CrawlRequest, CrawlResponse
from .database import db
from .crawler import WebCrawler
from .websocket import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Web Crawler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = ConnectionManager()
pending_crawls = {}
active_crawlers = {}

@app.on_event("startup")
async def startup_event():
    # ✅ Vérification connexion DB au démarrage
    await db.verify_connection()

@app.on_event("shutdown")
async def shutdown_event():
    # ✅ Fermeture propre
    await db.close()

@app.post("/api/crawl", response_model=CrawlResponse)
async def create_crawl(request: CrawlRequest):
    crawl_id = str(uuid.uuid4())
    root_url = str(request.url)
    
    try:
        # ✅ AWAIT CALL
        await db.create_crawl(crawl_id, root_url, request.max_depth)
    except Exception as e:
        logger.error(f"❌ DB Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    pending_crawls[crawl_id] = {
        "root_url": root_url,
        "max_depth": request.max_depth,
        "max_pages": request.max_pages,
        "crawl_mode": request.crawl_mode,
        "algorithm": request.algorithm,
    }
    
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
    try:
        if crawl_id in pending_crawls:
            config = pending_crawls.pop(crawl_id)
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
            
            async def run_crawl_wrapper():
                try:
                    await crawler.start()
                except Exception as e:
                    logger.error(f"❌ CRITICAL CRAWLER ERROR: {str(e)}")
                    traceback.print_exc()

            asyncio.create_task(run_crawl_wrapper())
        
        while True:
            await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
                
    except WebSocketDisconnect:
        manager.disconnect(crawl_id, websocket)
    except Exception:
        manager.disconnect(crawl_id, websocket)

@app.get("/api/crawl/{crawl_id}/graph")
async def get_crawl_graph(crawl_id: str):
    # ✅ AWAIT CALL
    graph = await db.get_crawl_graph(crawl_id)
    return graph