"""
Module de résumé de pages utilisant Groq API avec Llama 3.3 70B
Fetch la page à la demande au lieu d'utiliser le texte stocké
"""

import logging
import os
import re

import aiohttp
from bs4 import BeautifulSoup
from groq import Groq

logger = logging.getLogger(__name__)

# Configuration Groq
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Configuration des limites
MAX_INPUT_CHARS = 8000  # ~2000 tokens d'input
MAX_OUTPUT_TOKENS = 300  # Tokens de sortie pour le résumé


def get_groq_client():
    """Retourne un client Groq configuré."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable is not set")
    return Groq(api_key=GROQ_API_KEY)


async def fetch_and_clean_page(url: str) -> str:
    try:
        timeout = aiohttp.ClientTimeout(total=15)
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if response.status != 200:
                    raise ValueError(f"HTTP {response.status}")

                html = await response.text()
                soup = BeautifulSoup(html, "lxml")

                # Supprimer les éléments non pertinents
                for tag in soup(
                    [
                        "script",
                        "style",
                        "meta",
                        "noscript",
                        "header",
                        "footer",
                        "nav",
                        "aside",
                        "form",
                        "svg",
                        "iframe",
                        "button",
                        "input",
                        "select",
                        "textarea",
                        "img",
                        "video",
                        "audio",
                        "canvas",
                        "advertisement",
                        "ads",
                        "cookie",
                        "popup",
                    ]
                ):
                    tag.decompose()

                # Extraire le texte
                text = soup.get_text(separator=" ", strip=True)

                # Nettoyer les espaces multiples
                text = re.sub(r"\s+", " ", text).strip()

                return text

    except Exception as e:
        logger.error(f"Error fetching page {url}: {e}")
        raise ValueError(f"Impossible de récupérer la page: {str(e)}") from e


async def summarize_url(url: str) -> str:
    # 1. Récupérer et nettoyer le contenu
    text = await fetch_and_clean_page(url)

    if len(text.strip()) < 100:
        return "Contenu insuffisant pour générer un résumé."

    # 2. Tronquer si trop long
    truncated_text = text[:MAX_INPUT_CHARS]

    try:
        client = get_groq_client()

        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """Tu es un assistant spécialisé dans le résumé de pages web.
Tu dois résumer le contenu de manière concise et informative.
Réponds uniquement avec le résumé, sans introduction ni conclusion.
Le résumé doit être complet mais concis (3-5 phrases).
Inclus les points clés, les informations importantes et le sujet principal.
Réponds dans la même langue que le contenu.""",
                },
                {"role": "user", "content": f"Résume le contenu de cette page web :\n\n{truncated_text}"},
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=MAX_OUTPUT_TOKENS,
        )

        summary = chat_completion.choices[0].message.content
        logger.info(f"Summary generated for {url}: {len(summary)} chars")
        return summary.strip()

    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        return f"Erreur lors de la génération du résumé: {str(e)}"
