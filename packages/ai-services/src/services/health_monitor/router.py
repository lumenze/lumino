from fastapi import APIRouter

router = APIRouter()

@router.get("/status")
async def status():
    return {"service": "health_monitor", "status": "ok"}
