#!/usr/bin/env python3
"""
Worktree utilities for Multi-Agent Pipeline.

Provides:
    get_worktree_config         - Get worktree.yaml path
    get_worktree_base_dir       - Get worktree storage directory
    get_worktree_copy_files     - Get files to copy list
    get_worktree_post_create_hooks - Get post-create hooks
    get_agents_dir              - Get agents registry directory
"""

from __future__ import annotations

from pathlib import Path

from .paths import (
    DIR_WORKFLOW,
    get_repo_root,
    get_workspace_dir,
)


# =============================================================================
# YAML Simple Parser (no dependencies)
# =============================================================================

def parse_simple_yaml(content: str) -> dict:
    """Parse simple YAML (only supports key: value and lists).

    Args:
        content: YAML content string.

    Returns:
        Parsed dict.
    """
    result: dict = {}
    current_list: list | None = None

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if stripped.startswith("- "):
            if current_list is not None:
                current_list.append(stripped[2:].strip().strip('"').strip("'"))
        elif ":" in stripped:
            key, _, value = stripped.partition(":")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if value:
                result[key] = value
                _ = None
                current_list = None
            else:
                _ = key
                current_list = []
                result[key] = current_list

    return result


def _yaml_get_value(config_file: Path, key: str) -> str | None:
    """Read simple value from worktree.yaml.

    Args:
        config_file: Path to config file.
        key: Key to read.

    Returns:
        Value string or None.
    """
    try:
        content = config_file.read_text(encoding="utf-8")
        data = parse_simple_yaml(content)
        value = data.get(key)
        if isinstance(value, str):
            return value
    except (OSError, IOError):
        pass
    return None


def _yaml_get_list(config_file: Path, section: str) -> list[str]:
    """Read list from worktree.yaml.

    Args:
        config_file: Path to config file.
        section: Section name.

    Returns:
        List of items.
    """
    try:
        content = config_file.read_text(encoding="utf-8")
        data = parse_simple_yaml(content)
        value = data.get(section)
        if isinstance(value, list):
            return [str(item) for item in value]
    except (OSError, IOError):
        pass
    return []


# =============================================================================
# Worktree Configuration
# =============================================================================

# Worktree config file relative path (relative to repo root)
WORKTREE_CONFIG_PATH = f"{DIR_WORKFLOW}/worktree.yaml"


def get_worktree_config(repo_root: Path | None = None) -> Path:
    """Get worktree.yaml config file path.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        Absolute path to config file.
    """
    if repo_root is None:
        repo_root = get_repo_root()
    return repo_root / WORKTREE_CONFIG_PATH


def get_worktree_base_dir(repo_root: Path | None = None) -> Path:
    """Get worktree base directory.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        Absolute path to worktree base directory.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    config = get_worktree_config(repo_root)
    worktree_dir = _yaml_get_value(config, "worktree_dir")

    # Default value
    if not worktree_dir:
        worktree_dir = "../worktrees"

    # Handle relative path
    if worktree_dir.startswith("../") or worktree_dir.startswith("./"):
        # Relative to repo_root
        return repo_root / worktree_dir
    else:
        # Absolute path
        return Path(worktree_dir)


def get_worktree_copy_files(repo_root: Path | None = None) -> list[str]:
    """Get files to copy list.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        List of file paths to copy.
    """
    if repo_root is None:
        repo_root = get_repo_root()
    config = get_worktree_config(repo_root)
    return _yaml_get_list(config, "copy")


def get_worktree_post_create_hooks(repo_root: Path | None = None) -> list[str]:
    """Get post_create hooks.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        List of commands to run.
    """
    if repo_root is None:
        repo_root = get_repo_root()
    config = get_worktree_config(repo_root)
    return _yaml_get_list(config, "post_create")


# =============================================================================
# Agents Registry
# =============================================================================

def get_agents_dir(repo_root: Path | None = None) -> Path | None:
    """Get agents directory for current developer.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        Absolute path to agents directory, or None if no workspace.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    workspace_dir = get_workspace_dir(repo_root)
    if workspace_dir:
        return workspace_dir / ".agents"
    return None


# =============================================================================
# Main Entry (for testing)
# =============================================================================

if __name__ == "__main__":
    repo = get_repo_root()
    print(f"Repository root: {repo}")
    print(f"Worktree config: {get_worktree_config(repo)}")
    print(f"Worktree base dir: {get_worktree_base_dir(repo)}")
    print(f"Copy files: {get_worktree_copy_files(repo)}")
    print(f"Post create hooks: {get_worktree_post_create_hooks(repo)}")
    print(f"Agents dir: {get_agents_dir(repo)}")
