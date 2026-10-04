from pathlib import Path
from docx import Document
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.pagesizes import A4
from core.processing import correct_text, execute_job, analyze, validate


def test_correct_text():
    fixed, report = correct_text("Hello ,world!   \r\n\r\n\r\nNext line")
    assert fixed == "Hello, world!\n\nNext line\n"
    assert report["changed"] is True


def test_txt_to_docx_pdf_json(tmp_path):
    source = tmp_path / "input.txt"
    source.write_text("Hello engine.\nSecond line.", encoding="utf-8")
    for fmt in ("docx", "pdf", "json", "md"):
        out = tmp_path / f"out.{fmt}"
        result = execute_job(str(source), str(out), "convert", fmt, {})
        assert out.exists() and out.stat().st_size > 0
        assert result["target_format"] == fmt


def test_validate_analyze(tmp_path):
    source = tmp_path / "input.txt"
    source.write_text("one two three", encoding="utf-8")
    assert validate(str(source))["valid"]
    assert analyze(str(source))["statistics"]["words"] == 3


def test_docx_and_pdf_to_text(tmp_path):
    docx_path = tmp_path / "source.docx"
    doc = Document()
    doc.add_paragraph("DOCX source text")
    doc.save(docx_path)
    out_txt = tmp_path / "docx.txt"
    execute_job(str(docx_path), str(out_txt), "convert", "txt", {})
    assert "DOCX source text" in out_txt.read_text(encoding="utf-8")

    pdf_path = tmp_path / "source.pdf"
    canvas = Canvas(str(pdf_path), pagesize=A4)
    canvas.drawString(72, 760, "PDF source text")
    canvas.save()
    pdf_txt = tmp_path / "pdf.txt"
    execute_job(str(pdf_path), str(pdf_txt), "convert", "txt", {})
    assert "PDF source text" in pdf_txt.read_text(encoding="utf-8")


def test_pdf_preserves_unicode(tmp_path):
    source = tmp_path / "cyrillic.txt"
    source.write_text("Привет, Engine! Это русский текст.", encoding="utf-8")
    pdf = tmp_path / "cyrillic.pdf"
    execute_job(str(source), str(pdf), "convert", "pdf", {})
    extracted = read_pdf_text(pdf)
    assert "Привет" in extracted


def read_pdf_text(path):
    from pypdf import PdfReader
    return "\n".join((page.extract_text() or "") for page in PdfReader(path).pages)
