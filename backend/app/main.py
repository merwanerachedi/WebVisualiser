# backend/app/main.py
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uuid
from datetime import datetime
from typing import Dict

from .models import CrawlRequest, CrawlResponse, GraphData
from .database import db
from .crawler import WebCrawler
from .websocket import ConnectionManager

app = FastAPI(title="Web Crawler API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket manager
manager = ConnectionManager()

# Store active crawlers
active_crawlers: Dict[str, WebCrawler] = {}

@app.get("/")
async def root():
    return {"message": "Web Crawler API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "database": "connected" if (db and db.driver) else "disconnected"
    }



@app.post("/api/crawl", response_model=CrawlResponse)
async def start_crawl(request: CrawlRequest):
    """Démarrer un nouveau crawl"""
    crawl_id = str(uuid.uuid4())
    root_url = str(request.url)
    
    
    db.create_crawl(crawl_id, root_url, request.max_depth)
    
    
    crawler = WebCrawler(
        crawl_id=crawl_id,
        root_url=root_url,
        max_depth=request.max_depth,
        max_pages=request.max_pages,
        db=db,
        manager=manager,
        crawl_mode=request.crawl_mode, 
        algorithm=request.algorithm    
    )
    
    active_crawlers[crawl_id] = crawler
    
    import asyncio
    
    asyncio.create_task(crawler.start())
    
    return CrawlResponse(
        crawl_id=crawl_id,
        status="running",
        root_url=root_url,
        started_at=datetime.now(),
        crawl_mode=request.crawl_mode,  
        algorithm=request.algorithm      
    )
@app.get("/api/crawl/{crawl_id}/graph", response_model=GraphData)
async def get_crawl_graph(crawl_id: str):
    """Récupérer le graphe d'un crawl"""
    graph = db.get_crawl_graph(crawl_id)
    return GraphData(**graph)

@app.websocket("/ws/{crawl_id}")
async def websocket_endpoint(websocket: WebSocket, crawl_id: str):
    """WebSocket pour streaming temps réel"""
    await manager.connect(crawl_id, websocket)
    try:
        while True:
            # Garder la connexion ouverte
            data = await websocket.receive_text()
            # On peut recevoir des commandes du client ici si besoin
    except WebSocketDisconnect:
        manager.disconnect(crawl_id, websocket)

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup à l'arrêt"""
    db.close()