FROM vllm/vllm-openai:v0.10.1
RUN pip install --no-cache-dir runpod pillow
COPY handler.py /handler.py
ENTRYPOINT []
CMD ["python3", "-u", "/handler.py"]
