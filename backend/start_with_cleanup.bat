\
        @echo off
        REM Jalankan backend + cleanup snapshot otomatis.
        REM Default: hapus snapshot lebih tua dari 2 hari. Ubah jadi 1 kalau mau:
        REM set SNAPSHOT_RETENTION_DAYS=1

        cd /d %~dp0
        if "%SNAPSHOT_RETENTION_DAYS%"=="" set SNAPSHOT_RETENTION_DAYS=2

        python run_with_cleanup.py
