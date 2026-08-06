from fastapi import HTTPException, status


class ProblemWithUploadingFiles(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Problem with uploading files")


class FileTooLarge(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="File size is too large")


class InvalidContentType(HTTPException):
    def __init__(self, content_type: str = ""):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Content type is not allowed: {content_type}",
        )

