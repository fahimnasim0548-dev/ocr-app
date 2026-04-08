import os
import io
import re
from flask import Flask, render_template, request, jsonify, send_from_directory
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

app = Flask(__name__)

OUTPUT_FOLDER = "outputs"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents.readonly"
]

def get_creds():
    creds = None

    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                "credentials.json", SCOPES
            )
            creds = flow.run_local_server(port=0)

        with open("token.json", "w", encoding="utf-8") as token:
            token.write(creds.to_json())

    return creds

def extract_text_from_doc(doc):
    parts = []

    for item in doc.get("body", {}).get("content", []):
        paragraph = item.get("paragraph")
        if not paragraph:
            continue

        for element in paragraph.get("elements", []):
            text_run = element.get("textRun")
            if text_run and "content" in text_run:
                parts.append(text_run["content"])

    return "".join(parts).strip()

def sanitize_filename(image_name):
    base = os.path.splitext(image_name)[0]
    base = re.sub(r'[\\/*?:"<>|]', "_", base)
    return base + ".txt"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/run-ocr", methods=["POST"])
def run_ocr():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    image = request.files["image"]
    image_bytes = image.read()
    image_stream = io.BytesIO(image_bytes)

    creds = get_creds()
    drive_service = build("drive", "v3", credentials=creds)
    docs_service = build("docs", "v1", credentials=creds)

    file_metadata = {
        "name": image.filename,
        "mimeType": "application/vnd.google-apps.document"
    }

    media = MediaIoBaseUpload(
        image_stream,
        mimetype=image.mimetype,
        resumable=False
    )

    created = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id,name",
        ocrLanguage="ru"
    ).execute()

    doc_id = created["id"]
    doc = docs_service.documents().get(documentId=doc_id).execute()
    text = extract_text_from_doc(doc)

    return jsonify({
        "text": text
    })

@app.route("/save-text", methods=["POST"])
def save_text():
    data = request.get_json()
    image_name = data.get("image_name", "output.jpg")
    text = data.get("text", "")

    txt_name = sanitize_filename(image_name)
    save_path = os.path.join(OUTPUT_FOLDER, txt_name)

    with open(save_path, "w", encoding="utf-8") as f:
        f.write(text)

    return jsonify({
        "success": True,
        "file": txt_name
    })

@app.route("/download/<filename>")
def download_file(filename):
    return send_from_directory(OUTPUT_FOLDER, filename, as_attachment=True)

if __name__ == "__main__":
    app.run(debug=True)