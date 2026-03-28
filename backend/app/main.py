# backend/app/main.py
# (Imports existants...)
import asyncio
import logging
import traceback
import uuid
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_current_user, get_current_user_optional
from .auth_routes import router as auth_router
from .crawler import WebCrawler
from .database import db
from .models import CrawlHistoryItem, CrawlRequest, CrawlResponse
from .rate_limiter import RateLimiter
from .redis_cache import cache
from .websocket import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Web Crawler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://web-visualiser-two.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include auth routes
app.include_router(auth_router)

manager = ConnectionManager()
pending_crawls = {}
active_crawlers = {}


@app.on_event("startup")
async def startup_event():
    # Vérification connexion DB au démarrage
    await db.verify_connection()
    # Connexion Redis
    await cache.connect()


@app.on_event("shutdown")
async def shutdown_event():
    # Fermeture propre
    await db.close()
    await cache.close()


@app.post("/api/crawl", response_model=CrawlResponse)
async def create_crawl(
    request_obj: Request,
    request: CrawlRequest,
    current_user: dict | None = Depends(get_current_user_optional),
    _: None = Depends(RateLimiter(limit=5, window=60, key_prefix="crawl")),
):
    crawl_id = str(uuid.uuid4())
    root_url = str(request.url)
    user_id = current_user["user_id"] if current_user else None

    try:
        # Create crawl, optionally linked to user
        await db.create_crawl(
            crawl_id=crawl_id,
            root_url=root_url,
            max_depth=request.max_depth,
            user_id=user_id,
            crawl_mode=request.crawl_mode,
            algorithm=request.algorithm,
        )
    except Exception as e:
        logger.error(f"❌ DB Error: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e

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
        algorithm=request.algorithm,
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
                algorithm=config["algorithm"],
            )
            active_crawlers[crawl_id] = crawler

            async def run_crawl_wrapper():
                try:
                    await crawler.start()
                except Exception as e:
                    logger.error(f"❌ CRITICAL CRAWLER ERROR: {str(e)}")
                    traceback.print_exc()
                finally:
                    # ✅ Nettoyer le crawler quand il est terminé
                    if crawl_id in active_crawlers:
                        del active_crawlers[crawl_id]

            asyncio.create_task(run_crawl_wrapper())

        while True:
            try:
                # ✅ Attendre un message avec timeout de 30 secondes
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)

                # ✅ Répondre au ping du frontend
                if message == "ping":
                    await websocket.send_text("pong")
                else:
                    # Traiter les autres messages JSON
                    try:
                        import json

                        data = json.loads(message)
                        if data.get("action") == "stop_crawl":
                            logger.info(f"Stop crawl requested for {crawl_id}")
                            if crawl_id in active_crawlers:
                                active_crawlers[crawl_id].request_stop()
                    except json.JSONDecodeError:
                        pass

            except TimeoutError:
                # ✅ Pas de message ? On vérifie si le crawl est encore actif
                if crawl_id not in active_crawlers:
                    # Le crawl est terminé, on peut fermer proprement
                    logger.info(f"Crawl {crawl_id} finished, closing WebSocket")
                    break
                # Sinon on continue d'attendre (le crawl est encore en cours)
                continue

    except WebSocketDisconnect:
        manager.disconnect(crawl_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error for {crawl_id}: {e}")
        manager.disconnect(crawl_id, websocket)


@app.get("/api/crawl/{crawl_id}/graph")
async def get_crawl_graph(crawl_id: str):
    # ✅ AWAIT CALL
    graph = await db.get_crawl_graph(crawl_id)
    return graph


@app.get("/api/crawl/{crawl_id}/stats")
async def get_crawl_stats(crawl_id: str):
    """Get accurate stats for a crawl from the database."""
    try:
        stats = await db.get_crawl_stats(crawl_id)
        return stats
    except Exception as e:
        logger.error(f"Error fetching crawl stats: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/search")
async def search_pages(q: str):
    if not q:
        return []

    try:
        results = await db.search_similar_pages(q, top_k=5)
        return results
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========== CRAWL HISTORY ENDPOINTS ==========


@app.get("/api/crawls", response_model=list[CrawlHistoryItem])
async def get_user_crawls(
    request: Request,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(RateLimiter(limit=30, window=60, key_prefix="crawls", use_user_id=True)),
):
    """Get all crawls for the authenticated user."""
    request.state.user = current_user  # For rate limiter to use user_id
    try:
        crawls = await db.get_user_crawls(current_user["user_id"])
        return crawls
    except Exception as e:
        logger.error(f"Error fetching crawls: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.delete("/api/crawl/{crawl_id}")
async def delete_crawl(
    request: Request,
    crawl_id: str,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(RateLimiter(limit=10, window=60, key_prefix="crawl:delete", use_user_id=True)),
):
    """Delete a crawl (only if owned by the user)."""
    request.state.user = current_user  # For rate limiter to use user_id
    try:
        deleted = await db.delete_crawl(crawl_id, current_user["user_id"])
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Crawl not found or you don't have permission to delete it",
            )
        return {"message": "Crawl deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting crawl: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========== PAGERANK ENDPOINT ==========


@app.get("/api/crawl/{crawl_id}/pagerank")
async def get_pagerank(
    crawl_id: str,
    force: bool = False,
    _: None = Depends(RateLimiter(limit=5, window=60, key_prefix="pagerank")),
):
    """
    Calculate PageRank for a crawl, ignoring structural links (navbar/footer).

    Args:
        crawl_id: The crawl ID
        force: If True, recalculate even if scores exist

    Returns:
        has_scores: Whether scores exist
        max_score: Maximum score for normalization
        scores: Array of {url, title, score}
    """
    try:
        # 1. Si force=True, invalider le cache
        if force:
            await cache.invalidate_degree_centrality(crawl_id)
        else:
            # 2. Vérifier le cache Redis
            cached_result = await cache.get_degree_centrality(crawl_id)
            if cached_result:
                return cached_result

        # 3. Calculer depuis Neo4j
        results = await db.calculate_degree_centrality(crawl_id, force=force)

        # 4. Mettre en cache si des scores existent
        if results.get("has_scores"):
            await cache.set_degree_centrality(crawl_id, results)

        return results
    except Exception as e:
        logger.error(f"Error calculating PageRank: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========== SUMMARIZATION ENDPOINT ==========


@app.post("/api/page/summarize")
async def summarize_page(
    request: Request,
    url: str,
    _: None = Depends(RateLimiter(limit=2, window=60, key_prefix="summarize")),
):
    # Génerer ou récupérer un résumé pour une page (depuis redis si possible)
    from .summarizer import summarize_url

    try:
        # 1. Vérifier si un résumé existe déjà dans Redis
        cached_summary = await cache.get_summary(url)
        if cached_summary:
            return {"summary": cached_summary, "cached": True}

        # 2. Récupérer la page et générer le résumé (fetch on-demand)
        summary = await summarize_url(url)

        # 3. Sauvegarder dans Redis (TTL: 7 jours)
        await cache.set_summary(url, summary)

        return {"summary": summary, "cached": False}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error summarizing page: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========== SIMILAR PAGES ENDPOINT ==========


@app.get("/api/crawl/{crawl_id}/embedding-status")
async def get_embedding_status(crawl_id: str):
    """Get the embedding generation status for a crawl."""
    try:
        status = await db.get_embedding_status(crawl_id)
        return {"crawl_id": crawl_id, "embedding_status": status}
    except Exception as e:
        logger.error(f"Error getting embedding status: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/page/similar")
async def find_similar_pages(
    request: Request,
    url: str,
    crawl_id: str = None,
    limit: int = 10,
    _: None = Depends(RateLimiter(limit=10, window=60, key_prefix="similar")),
):
    """Find pages with similar content to the given URL using embeddings."""
    try:
        # Vérifier si les embeddings sont prêts (si crawl_id fourni)
        if crawl_id:
            status = await db.get_embedding_status(crawl_id)
            if status != "completed":
                return {
                    "error": "embeddings_not_ready",
                    "status": status,
                    "message": "Les embeddings sont en cours de génération. Réessayez dans quelques instants.",
                }

        similar_pages = await db.find_similar_pages_by_url(url, top_k=limit)
        return similar_pages
    except Exception as e:
        logger.error(f"Error finding similar pages: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========== OUTLINKS ENDPOINT ==========


@app.get("/api/crawl/{crawl_id}/page/outlinks")
async def get_page_outlinks(
    crawl_id: str,
    url: str,
    page: int = 1,
    per_page: int = 50,
    _: None = Depends(RateLimiter(limit=30, window=60, key_prefix="page_outlinks")),
):
    """
    Récupère les liens sortants (pages découvertes non-crawlées) d'une page.
    Retourne le PageRank de chaque page si disponible pour le tri côté frontend.
    """
    try:
        result = await db.get_page_outlinks(crawl_id, url, page, per_page)
        return result
    except Exception as e:
        logger.error(f"Error fetching page outlinks: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ========== Health Routes ==========


@app.get("/health")
async def health_check():
    """Check if the API is running."""
    return {"status": "ok"}
