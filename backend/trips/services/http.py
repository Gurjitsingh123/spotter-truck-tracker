import requests
from django.conf import settings

from trips.services.errors import UpstreamError

_session = requests.Session()


def call_api(method: str, url: str, *, service: str, timeout: float = 20, **kwargs) -> requests.Response:
    headers = {"User-Agent": settings.HTTP_USER_AGENT, **kwargs.pop("headers", {})}
    try:
        return _session.request(method, url, timeout=timeout, headers=headers, **kwargs)
    except requests.RequestException as error:
        raise UpstreamError(f"{service} is not responding right now. Please try again in a minute.") from error
