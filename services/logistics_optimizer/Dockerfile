FROM python:3.12-slim
WORKDIR /app
COPY services/logistics_optimizer/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/logistics_optimizer/app.py ./app.py
RUN useradd -r -u 10001 optimizer
USER optimizer
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
