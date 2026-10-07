"""Input validation utilities."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit


def _is_private_or_local_ip(address: ipaddress._BaseAddress) -> bool:
    return (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
    )


BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "instance-data",
}

BLOCKED_SUFFIXES = (
    ".local",
    ".internal",
    ".localhost",
    ".lan",
    ".corp",
    ".home",
    ".arpa",
    ".test",
    ".invalid",
)


def is_safe_url(raw_url: str, max_length: int = 2048) -> bool:
    if not raw_url or len(raw_url.strip()) == 0 or len(raw_url) > max_length:
        return False
    if any(character.isspace() for character in raw_url):
        return False
    try:
        parsed = urlsplit(raw_url)
    except ValueError:
        return False
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return False

    hostname = (parsed.hostname or "").lower()
    if not hostname or hostname.startswith(".") or hostname.endswith("."):
        return False

    if hostname in BLOCKED_HOSTNAMES or hostname.endswith(BLOCKED_SUFFIXES):
        return False

    try:
        ip_address = ipaddress.ip_address(hostname)
        return not _is_private_or_local_ip(ip_address)
    except ValueError:
        if "." not in hostname:
            return False
        try:
            resolved = socket.getaddrinfo(
                hostname,
                parsed.port or (443 if parsed.scheme.lower() == "https" else 80),
                socket.AF_UNSPEC,
                socket.SOCK_STREAM,
            )
            for _, _, _, _, sockaddr in resolved:
                candidate = sockaddr[0]
                try:
                    ip_address = ipaddress.ip_address(candidate)
                    if _is_private_or_local_ip(ip_address):
                        return False
                except ValueError:
                    continue
        except (socket.gaierror, socket.timeout, OSError):
            pass

        return True

