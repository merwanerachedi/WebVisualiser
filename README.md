🕸️ WebVisualizer — Semantic Graph Explorer

WebVisualizer is an interactive tool that crawls websites, analyzes their semantic content using AI, and visualizes the relationships between pages as a 3D graph.

Unlike traditional crawlers that rely only on hyperlinks, WebVisualizer highlights semantic connections between pages, offering deeper insights into website structure and meaning.

🔴 Live Demo: https://web-visualiser-two.vercel.app/

📄 API Docs: https://webvisualiser.onrender.com/docs

✨ Key Features
🕷️ Configurable & Intelligent Crawling

Scrapes web pages and extracts clean, readable text

Custom crawling strategies:

Traversal Algorithms: BFS or DFS

Scope Control: Same Domain, External Links, or All

Adaptable to different analysis use cases

📝 AI Summarization

Automatically generates concise summaries for each visited page

Allows users to quickly understand page content without reading everything

🧠 AI-Powered Embeddings

Converts page content into 384-dimensional vector embeddings

Model: all-MiniLM-L6-v2 via FastEmbed

Enables semantic similarity search between pages

🕸️ Graph & Vector Database

Neo4j stores:

Structural links (HTML <a> tags)

Semantic similarity using a Vector Index

⚡ Real-Time Visualization

Live crawling updates via WebSockets

Graph nodes and edges appear in real time on the frontend

🛡️ Advanced Security

Dual JWT Authentication

Access Token

Refresh Token

Rate Limiting

Token Bucket algorithm

Powered by Redis

🔄 CI/CD Pipeline

Fully automated pipeline ensuring:

Code quality

Stable deployments

🏗️ Architecture & Tech Stack
Backend — The Brain

Framework: FastAPI (Python 3.11)

Concurrency: AsyncIO & WebSockets

AI Engine: FastEmbed (Quantized ONNX Runtime)

Database: Neo4j AuraDB (Graph + Vector Search)

Cache: Redis (Rate Limiting & Sessions)

Deployment: Docker on Render.com

Frontend — The Face

Framework: Next.js 14 (React + TypeScript)

3D Visualization: react-force-graph-3d

Deployment: Vercel

DevOps & Infrastructure

Containerization: Docker & Docker Compose

CI/CD Workflow:

Continuous Integration

Ruff (linting & formatting)

Docker build validation on every commit

Continuous Deployment

Push to main triggers automatic deployments

Backend → Render

Frontend → Vercel

🔧 Technical Challenges & Key Decisions
1️⃣ Memory Optimization — The 512MB Limit 📉

Challenge
Running Transformer models on a free cloud tier caused frequent OOM crashes.

Solution

Migrated from sentence-transformers (PyTorch) to FastEmbed (ONNX Runtime)

Result

Memory usage reduced from ~800MB → ~250MB

Stable deployment on free-tier infrastructure

2️⃣ AuraDB Constraints, PageRank & Noise Filtering 🧹

Challenges

Neo4j AuraDB Free Tier restricts heavy Graph Data Science algorithms

Crawling produced noisy graphs (navbars, footers, irrelevant links)

Solutions

Implemented a custom lightweight PageRank algorithm

Added intelligent filtering:

Ignored links from headers and footers

Kept only contextually relevant content links

3️⃣ UX vs Performance — Discovered Pages ⚖️

Challenge

Rendering thousands of discovered (uncrawled) pages caused severe FPS drops

Decision

Visualize only fully analyzed nodes

Keep deep discovery data in the backend

Result

Smooth 60 FPS experience

Clean and readable graph visualization

4️⃣ Cross-Domain Security 🛡️

Challenge

Modern browsers block third-party cookies (Vercel ↔ Render)

Solution

Dynamic CORS configuration

JWT transmission strategy compatible with cookie restrictions

Secure fallback using localStorage

🚀 Getting Started (Fast Way)

The easiest way to run the project locally is using Docker Compose.

Prerequisites

Docker Desktop

Git

1️⃣ Clone & Configure
git clone https://github.com/your-username/webvisualiser.git
cd webvisualiser

# Create .env files based on .env.example
# Neo4j credentials are required in backend/.env

2️⃣ Ignite 🚀
docker-compose up --build

3️⃣ Explore

Frontend: http://localhost:3000

API Docs: http://localhost:8000/docs

🔮 Future Improvements

 Hybrid Crawling Engine (JavaScript-heavy sites, Cloudflare bypass)

 Smart Graph Deduplication (unique discovery paths)

 Deep Testing Suite (Pytest & Jest)

 Batch Processing (embeddings & DB writes)

 RAG Integration — Chat with your Graph

 Multi-language Website Support

👤 Author

Ton Nom
