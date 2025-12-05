# backend/app/websocket.py
from fastapi import WebSocket
from typing import Dict, List
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # crawl_id -> list of websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, crawl_id: str, websocket: WebSocket):
        await websocket.accept()
        if crawl_id not in self.active_connections:
            self.active_connections[crawl_id] = []
        self.active_connections[crawl_id].append(websocket)
        logger.info(f"Client connected to crawl {crawl_id}")
    
    def disconnect(self, crawl_id: str, websocket: WebSocket):
        if crawl_id in self.active_connections:
            self.active_connections[crawl_id].remove(websocket)
            if not self.active_connections[crawl_id]:
                del self.active_connections[crawl_id]
        logger.info(f"Client disconnected from crawl {crawl_id}")
    
    async def broadcast(self, crawl_id: str, message: dict):
        """Envoyer un message à tous les clients d'un crawl"""
        if crawl_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[crawl_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message: {e}")
                    disconnected.append(connection)
            
            # Cleanup des connexions mortes
            for conn in disconnected:
                self.disconnect(crawl_id, conn)