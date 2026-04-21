import os

import chromadb
from sentence_transformers import SentenceTransformer


CHROMA_PATH = "./chroma_db"
COLLECTION_NAME = "uni_documents_2025"
EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")


def createClient():
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    return client


def getOrCreateCollection(client):
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    return collection


def createIds(chunksArray, sourceFile):
    ids = []
    baseName = os.path.basename(sourceFile)
    stemName = os.path.splitext(baseName)[0]
    index = 0
    total = len(chunksArray)
    while index < total:
        chunkId = stemName + "-chunk-" + str(index)
        ids.append(chunkId)
        index = index + 1
    return ids


def extractBreadcrumb(chunk):
    lines = chunk.split("\n")
    breadcrumb = lines[0]
    breadcrumb = breadcrumb.strip()
    return breadcrumb


def extractSection(breadcrumb):
    parts = breadcrumb.split(" > ")
    hasSection = len(parts) > 1
    if hasSection:
        section = parts[1]
    else:
        section = parts[0]
    section = section.strip()
    return section


def createMetadatas(chunksArray, sourceFile):
    metadatas = []
    baseName = os.path.basename(sourceFile)
    index = 0
    total = len(chunksArray)
    while index < total:
        chunk = chunksArray[index]
        breadcrumb = extractBreadcrumb(chunk)
        section = extractSection(breadcrumb)
        meta = {
            "source": baseName,
            "breadcrumb": breadcrumb,
            "chunk_index": index,
            "section": section,
        }
        metadatas.append(meta)
        index = index + 1
    return metadatas


def generateEmbeddings(chunksArray):
    embeddingsRaw = EMBED_MODEL.encode(chunksArray)
    embeddings = []
    for vector in embeddingsRaw:
        singleList = vector.tolist()
        embeddings.append(singleList)
    return embeddings


def insertIntoCollection(collection, ids, chunks, embeddings, metadatas):
    collection.add(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    print("Inserted " + str(len(ids)) + " chunks into collection: " + COLLECTION_NAME)
    return


def storeChunksInChroma(chunksArray, filePath):
    client = createClient()
    collection = getOrCreateCollection(client)
    ids = createIds(chunksArray, filePath)
    metadatas = createMetadatas(chunksArray, filePath)
    embeddings = generateEmbeddings(chunksArray)
    insertIntoCollection(collection, ids, chunksArray, embeddings, metadatas)
    print("Done. Total chunks stored: " + str(len(chunksArray)))
    return
