#!/usr/bin/env python3
import sys
import os
import subprocess

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 backend/ingest_all.py pdf <path_to_file_or_directory>")
        sys.exit(1)

    ingest_type = sys.argv[1].lower()
    path_arg = sys.argv[2]

    if ingest_type != "pdf":
        print(f"Error: Unsupported ingestion type '{ingest_type}'. Only 'pdf' is supported.")
        sys.exit(1)

    # Resolve input path (expanding ~ and relative paths)
    resolved_path = os.path.abspath(os.path.expanduser(path_arg))
    if not os.path.exists(resolved_path):
        print(f"Error: Path not found: {resolved_path}")
        sys.exit(1)

    # Locate the JS script relative to this python script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    js_script = os.path.join(script_dir, "scratch", "ingest-pdf.js")

    if not os.path.exists(js_script):
        print(f"Error: Ingestion engine not found at: {js_script}")
        sys.exit(1)

    print(f"[Python CLI] Path resolved to: {resolved_path}")
    print(f"[Python CLI] Delegating processing to GitSense ingestion engine...")
    
    cmd = ["node", js_script, resolved_path]
    try:
        # Run subprocess and inherit stdout/stderr for real-time output
        result = subprocess.run(cmd, check=True)
        sys.exit(result.returncode)
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Execution failed with return code {e.returncode}")
        sys.exit(e.returncode)
    except FileNotFoundError:
        print("\n❌ Error: 'node' executable not found in your system PATH. Please verify Node.js is installed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
