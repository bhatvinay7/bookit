#!/usr/bin/env python3
"""Compatibility entry point for the Kubernetes delivery configuration importer."""
from pathlib import Path
import runpy

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).resolve().parents[1] /
                       'bookit-k8s/scripts/import_delivery_env.py'), run_name='__main__')
