FROM paddlepaddle/paddle:3.2.0-gpu-cuda12.6-cudnn9.5
RUN pip install --no-cache-dir "paddleocr[doc-parser]" runpod
COPY handler.py /handler.py
CMD ["python", "-u", "/handler.py"]
