import os
import sys
import requests
import json
import fitz  # pymupdf
from dotenv import load_dotenv
load_dotenv()

PDF_TO_MD_SYSTEM_PROMPT = """\
You are an advanced AI document processing tool. Your task is to convert a PDF document into Markdown format while preserving the original layout and structure. You will receive a PDF document as input, and your output should be a well-structured Markdown document that accurately represents the content of the PDF. The PDF may contain text, images, tables, and other elements. Your goal is to extract all relevant information and format it appropriately in Markdown. Your output should include the following: - Text Content:** Extract all text from the PDF and format it in Markdown, maintaining headings, paragraphs, and lists. - Headings:** Use appropriate Markdown syntax for headings (e.g., # for H1, ## for H2, etc.). - Lists:** Convert bullet points and numbered lists into Markdown lists. - Links:** Convert any hyperlinks into Markdown format. - Images:** For each image, include an HTML <img> tag with:   - `src="[image-placeholder]"`   - An `alt` attribute providing a detailed executive summary of the image's content.   - If the image is a graph or chart, provide an in-depth description of the data and its implications. - Tables: ** Convert tables into Markdown format, ensuring proper alignment and structure. - Text Formatting:** Maintain bold, italic, and underline formatting where applicable. - Footnotes and Endnotes:** Convert footnotes and endnotes into Markdown format. - Page Numbers:** Include page numbers in the output for reference. - Metadata:** Include any relevant metadata (e.g., title, author, date) at the beginning of the document. - Document Structure:** Maintain the original document structure, including sections and subsections. - Accessibility:** Ensure the output is accessible, with appropriate alt text for images and clear headings for screen readers. - Clarity and Readability:** Ensure the output is clear and easy to read, with appropriate line breaks and spacing. - Markdown Syntax:** Use standard Markdown syntax for all formatting. - No Additional Text:** Do not include any additional text or explanations. - No Personal Opinions:** Do not include any personal opinions or subjective statements in the output.  VERY IMPORTANT!!!!: NO TRIPLE BACKTICKS:** DO NOT SURROUND THE OUTPUT WITH TRIPLE BACKTICKS FOR ANY CONTENT!!!!
"""


class PdfToMarkdownConverter:
    def __init__(self):
        self.api_key = os.environ["OPENROUTER_API_KEY"]
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _post_process_markdown(self, text: str) -> str:
        """Removes any triple backticks that might be surrounding the markdown content."""
        if text.startswith("```markdown") or text.startswith("```md"):
            closing_index = text.rfind("```")
            if closing_index != -1:
                newline_index = text.find("\n")
                if newline_index != -1 and newline_index < closing_index:
                    return text[newline_index + 1:closing_index].strip()

        if text.startswith("```") and text.endswith("```"):
            return text[3:-3].strip()

        return text

    def convert(self, pdf_path: str) -> str:
        """Extract text from PDF locally, then convert to Markdown via Nemotron."""
        doc = fitz.open(pdf_path)
        pdf_text = ""
        for page in doc:
            pdf_text += f"\n\n--- Page {page.number + 1} ---\n"
            pdf_text += page.get_text()
        doc.close()

        response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers=self.headers,
            data=json.dumps({
                "model": "nvidia/nemotron-3-super-120b-a12b:free",
                "messages": [
                    {"role": "system", "content": PDF_TO_MD_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Convert the following PDF text to Markdown:\n\n{pdf_text}"},
                ],
                "reasoning": {"enabled": True},
            }),
        )
        response.raise_for_status()

        result = response.json()["choices"][0]["message"].get("content", "")

        if not result:
            raise ValueError("Model response did not contain text.")

        return self._post_process_markdown(result)


# --- CLI usage ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pdf_to_markdown.py <path_to_pdf> [output.md]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else pdf_path.replace(".pdf", ".md")

    converter = PdfToMarkdownConverter()
    print(f"Converting {pdf_path} ...")
    markdown = converter.convert(pdf_path)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"Done! Saved to {output_path}")