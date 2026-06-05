from backend.core.asr import extract_text_from_pdf


def _write_minimal_text_pdf(path):
    text_stream = b"BT /F1 12 Tf 50 150 Td (Dummy PDF file) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 200 200] /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(text_stream)).encode("ascii") + b" >>\nstream\n" + text_stream + b"\nendstream",
    ]
    content = b"%PDF-1.4\n"
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(content))
        content += f"{index} 0 obj\n".encode("ascii") + obj + b"\nendobj\n"
    xref_offset = len(content)
    content += b"xref\n0 6\n0000000000 65535 f \n"
    for offset in offsets:
        content += f"{offset:010d} 00000 n \n".encode("ascii")
    content += (
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"
        + str(xref_offset).encode("ascii")
        + b"\n%%EOF\n"
    )
    path.write_bytes(content)


def test_extract_text_from_pdf_reads_selectable_text(tmp_path):
    pdf_path = tmp_path / "sample.pdf"
    _write_minimal_text_pdf(pdf_path)

    result = extract_text_from_pdf(str(pdf_path))

    assert result["engine"] == "pypdf"
    assert result["page_count"] == 1
    assert result["pages_with_text"] == 1
    assert "Dummy PDF file" in result["text"]
