from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import os
import shutil
from pathlib import Path

router = APIRouter()

DATASET_DIR = Path("backend/dataset/faces")
MODEL_DIR = Path("backend/dataset/models")

@router.post("/upload/frame/")
async def upload_frame(resident_id: int = Form(...), file: UploadFile = File(...)):
    resident_folder = DATASET_DIR / str(resident_id)
    resident_folder.mkdir(parents=True, exist_ok=True)

    file_index = len(list(resident_folder.glob("*.jpg"))) + 1
    file_path = resident_folder / f"{file_index}.jpg"

    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"message": "Frame uploaded", "file": str(file_path)}

@router.post("/train/{resident_id}")
async def train_resident(resident_id: int):
    resident_folder = DATASET_DIR / str(resident_id)
    if not resident_folder.exists():
        raise HTTPException(status_code=404, detail="Resident data not found")

    # ❗ Placeholder training (nanti bisa diisi model sebenarnya)
    model_path = MODEL_DIR / f"{resident_id}.model"
    with open(model_path, "w") as f:
        f.write("MODEL DATA (dummy)")

    return {"message": "Training complete", "model_path": str(model_path)}
