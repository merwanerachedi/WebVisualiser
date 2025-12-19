# backend/app/models.py
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, HttpUrl


class CrawlRequest(BaseModel):
    url: HttpUrl
    max_depth: int = 3
    max_pages: int = 100

    crawl_mode: Literal["INTERNAL", "EXTERNAL", "ALL"] = "INTERNAL"

    algorithm: Literal["BFS", "DFS"] = "BFS"


class CrawlResponse(BaseModel):
    crawl_id: str
    status: str
    root_url: str
    started_at: datetime
    crawl_mode: str
    algorithm: str


class PageData(BaseModel):
    url: str
    title: str | None = None
    status_code: int
    domain: str
    path: str
    content_type: str | None = None


class LinkData(BaseModel):
    source: str
    target: str
    anchor_text: str | None = None


class GraphData(BaseModel):
    nodes: list[dict]
    edges: list[dict]


class WebSocketMessage(BaseModel):
    type: str  # "page_discovered", "link_created", "crawl_complete", "error"
    data: dict
