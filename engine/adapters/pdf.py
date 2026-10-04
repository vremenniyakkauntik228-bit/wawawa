from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from adapters.base import DocumentAdapter
from core.errors import EngineError


_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/DejaVu Sans.ttf",
    "C:/Windows/Fonts/DejaVuSans.ttf",
)


def _pdf_font() -> str:
    name = "EngineDejaVuSans"
    if name not in pdfmetrics.getRegisteredFontNames():
        for candidate in _FONT_CANDIDATES:
            if Path(candidate).is_file():
                pdfmetrics.registerFont(TTFont(name, candidate))
                return name
    if name in pdfmetrics.getRegisteredFontNames():
        return name
    return "Helvetica"


class PdfAdapter(DocumentAdapter):
    formats = ("pdf",)
    media_types = ("application/pdf",)

    def extract_text(self, path: str) -> str:
        try:
            reader = PdfReader(path)
            return "\n".join((page.extract_text() or "") for page in reader.pages).strip() + "\n"
        except Exception as exc:
            raise EngineError("invalid_pdf", "Unable to open or extract PDF document", 422, {"reason": str(exc)})

    def validate(self, path: str) -> dict:
        try:
            reader = PdfReader(path)
            text = self.extract_text(path)
            return {"valid": not bool(getattr(reader, "is_encrypted", False)), "format": "pdf", "pages": len(reader.pages), "characters": len(text), "encrypted": bool(getattr(reader, "is_encrypted", False))}
        except Exception as exc:
            raise EngineError("invalid_pdf", "PDF validation failed", 422, {"reason": str(exc)})

    def write_from_text(self, text: str, path: str, options: dict) -> None:
        font = str(options.get("font", "DejaVuSans"))
        if font == "DejaVuSans":
            font = _pdf_font()
        elif font not in {"Helvetica", "Times-Roman", "Courier"}:
            raise EngineError("unsupported_pdf_font", "Only DejaVuSans, Helvetica, Times-Roman and Courier are supported", 422)
        font_size = float(options.get("font_size", 10))
        leading = float(options.get("leading", font_size * 1.35))
        width, height = A4
        margin = 42
        usable = width - margin * 2
        c = canvas.Canvas(path, pagesize=A4)
        c.setTitle(str(options.get("title", "Document")))
        c.setFont(font, font_size)
        y = height - margin
        for paragraph in text.split("\n"):
            if not paragraph:
                y -= leading
                if y < margin:
                    c.showPage(); c.setFont(font, font_size); y = height - margin
                continue
            words = paragraph.split()
            line = ""
            for word in words:
                candidate = word if not line else line + " " + word
                if stringWidth(candidate, font, font_size) <= usable:
                    line = candidate
                else:
                    c.drawString(margin, y, line)
                    y -= leading
                    if y < margin:
                        c.showPage(); c.setFont(font, font_size); y = height - margin
                    line = word
            if line:
                c.drawString(margin, y, line)
                y -= leading
                if y < margin:
                    c.showPage(); c.setFont(font, font_size); y = height - margin
        c.save()
