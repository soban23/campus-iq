from ingestion.chunking import chunkMarkdownFile
from ingestion.storage import storeChunksInChroma


if __name__ == "__main__":
    inputFile = r"<input_file.md>"
    chunks = chunkMarkdownFile(inputFile)
    storeChunksInChroma(chunks, inputFile)