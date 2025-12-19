# backend/app/websocket.py
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # crawl_id -> list of websockets
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, crawl_id: str, websocket: WebSocket):
        await websocket.accept()
        if crawl_id not in self.active_connections:
            self.active_connections[crawl_id] = []
        self.active_connections[crawl_id].append(websocket)
        logger.info(f"Client connected to crawl {crawl_id}")

    def disconnect(self, crawl_id: str, websocket: WebSocket):
        if crawl_id in self.active_connections:
            if websocket in self.active_connections[crawl_id]:
                self.active_connections[crawl_id].remove(websocket)
            if not self.active_connections[crawl_id]:
                del self.active_connections[crawl_id]
        logger.info(f"Client disconnected from crawl {crawl_id}")

    async def broadcast(self, crawl_id: str, message: dict):
        """Envoyer un message à tous les clients d'un crawl"""
        if crawl_id in self.active_connections:
            disconnected = []
            # logger.debug(f"Broadcasting to {len(self.active_connections[crawl_id])} clients")

            for connection in list(self.active_connections[crawl_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to crawl {crawl_id}: {e}")
                    disconnected.append(connection)

            # Cleanup des connexions mortes
            for conn in disconnected:
                self.disconnect(crawl_id, conn)

    # ✅ AJOUT : Méthode de compatibilité pour main.py
    async def send_personal_message(self, message: dict, crawl_id: str):
        """
        Cette méthode est appelée par main.py.
        Elle redirige simplement vers broadcast pour prévenir tous les onglets ouverts.
        Note l'inversion des arguments (message, crawl_id) vs (crawl_id, message)
        """
        await self.broadcast(crawl_id, message)

    def has_connections(self, crawl_id: str) -> bool:
        """Vérifie si au moins un client est connecté pour ce crawl"""
        return crawl_id in self.active_connections and len(self.active_connections[crawl_id]) > 0
