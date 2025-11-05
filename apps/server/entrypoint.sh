#!/bin/sh
set -e

# Build the database URL
export DATABASE_PATH="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}?schema=public"
export DATABASE_URL="$DATABASE_PATH"

# Print the constructed DATABASE_URL (redact password)
REDACTED_URL="postgresql://${DATABASE_USER}:*****@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}?schema=public"
echo "[entrypoint] DATABASE_URL: $REDACTED_URL"

# Wait for the database to become reachable before attempting migrations.
# Use a small Node.js TCP probe (available in the runtime) to avoid adding
# extra OS packages. We retry until timeout to tolerate slower RDS startups.
wait_for_db() {
	host="${DATABASE_HOST:-localhost}"
	port="${DATABASE_PORT:-5432}"
	timeout=${DB_WAIT_TIMEOUT:-300}   # seconds
	interval=${DB_WAIT_INTERVAL:-5}   # seconds

	echo "[entrypoint] Waiting for DB $host:$port (timeout ${timeout}s)..."
	elapsed=0
	while true; do
		# Node one-liner: try to open a TCP connection to host:port
		node -e "const net=require('net');const [host,port]=process.argv.slice(1);const s=new net.Socket();s.setTimeout(2000);s.on('error',()=>process.exit(1));s.on('timeout',()=>process.exit(2));s.connect(parseInt(port),host,()=>{s.end();process.exit(0)});" "$host" "$port" && break

		sleep $interval
		elapsed=$((elapsed + interval))
		if [ "$elapsed" -ge "$timeout" ]; then
			echo "[entrypoint] Timeout waiting for DB after ${timeout}s"
			return 1
		fi
		echo "[entrypoint] Still waiting for DB... ($elapsed/$timeout)"
	done

	echo "[entrypoint] DB reachable"
	return 0
}

if ! wait_for_db; then
	echo "[entrypoint] Database did not become available, exiting"
	exit 1
fi

echo "Running database migrations..."
# Run migrations and fail if they consistently fail (they should succeed once DB is up)
npx prisma migrate deploy --schema=/app/prisma/schema.prisma || {
	echo "[entrypoint] prisma migrate failed"
	exit 1
}

echo "Starting server..."
exec node apps/server/dist/index.js
