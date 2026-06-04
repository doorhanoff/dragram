from .service import S3Service, s3_service


def get_s3_service() -> S3Service:
    return s3_service
