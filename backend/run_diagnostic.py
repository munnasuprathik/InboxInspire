"""
Run diagnostic and save to file
"""
import subprocess
import sys

result = subprocess.run(
    [r"..\venv\Scripts\python.exe", "diagnose_goals.py"],
    capture_output=True,
    text=True,
    cwd=r"C:\Users\munna\Downloads\Tend-1\backend"
)

with open("diagnostic_output.txt", "w") as f:
    f.write(result.stdout)
    if result.stderr:
        f.write("\n\nERRORS:\n")
        f.write(result.stderr)

print(result.stdout)
