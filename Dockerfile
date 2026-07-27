# Dockerfile for FactoryMind AI
# Use official slim Python image
FROM python:3.11-slim

# Environment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Create app directory
WORKDIR /app

# Install pip dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app

# Expose the port uvicorn will listen on
EXPOSE 8080

# Use non-root user for better security
RUN useradd -m appuser || true
USER appuser

# Start the app with uvicorn
CMD ["python", "-m", "uvicorn", "src.backend:app", "--host", "0.0.0.0", "--port", "8080"]
