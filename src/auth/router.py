from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from .depends import get_auth_service, get_token_payload
from .schemas import RegisterForm, LoginForm, TokenData, UserShortResponse
from .service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(credentials: RegisterForm, service: AuthService = Depends(get_auth_service)):
    user = await service.register(credentials)
    if not user:
        raise HTTPException(status_code=400, detail="User already exists")
    return {"id": user.id}


@router.post("/login")
async def login(credentials: LoginForm, response: Response, service: AuthService = Depends(get_auth_service)):
    tokens = await service.login(credentials)
    if not tokens:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    response.set_cookie("token", tokens.access_token, httponly=True, samesite="lax")
    response.set_cookie("refresh_token", tokens.refresh_token, httponly=True, samesite="lax")
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request, response: Response, service: AuthService = Depends(get_auth_service)):
    token = request.cookies.get("refresh_token")
    if token:
        await service.revoke_token(token)
    response.delete_cookie("token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


@router.post("/refresh")
async def refresh(request: Request, response: Response, service: AuthService = Depends(get_auth_service)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401)
    tokens = await service.refresh_access_token(refresh_token)
    if not tokens:
        raise HTTPException(status_code=401)
    response.set_cookie("token", tokens.access_token, httponly=True, samesite="lax")
    return {"ok": True}


@router.get("/me", response_model=UserShortResponse)
async def me(payload: TokenData = Depends(get_token_payload), service: AuthService = Depends(get_auth_service)):
    user = await service.get_user_by_id(payload.id)
    if not user:
        raise HTTPException(status_code=404)
    return user
