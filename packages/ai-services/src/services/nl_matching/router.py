from fastapi import APIRouter

router = APIRouter()

@router.get("/status")
async def status():
    return {"service": "nl_matching", "status": "ok"}
