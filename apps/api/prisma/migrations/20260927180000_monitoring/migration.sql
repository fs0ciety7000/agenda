-- CreateTable
CREATE TABLE "StatusCheck" (
    "id" UUID NOT NULL,
    "component" VARCHAR(24) NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "detail" VARCHAR(200),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusDaily" (
    "component" VARCHAR(24) NOT NULL,
    "day" DATE NOT NULL,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "latencySum" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StatusDaily_pkey" PRIMARY KEY ("component","day")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" UUID NOT NULL,
    "component" VARCHAR(24) NOT NULL,
    "detail" VARCHAR(200),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestMetric" (
    "minute" TIMESTAMP(3) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "errors4xx" INTEGER NOT NULL DEFAULT 0,
    "errors5xx" INTEGER NOT NULL DEFAULT 0,
    "latencySum" INTEGER NOT NULL DEFAULT 0,
    "latencyMax" INTEGER NOT NULL DEFAULT 0,
    "slow" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RequestMetric_pkey" PRIMARY KEY ("minute")
);

-- CreateIndex
CREATE INDEX "StatusCheck_component_checkedAt_idx" ON "StatusCheck"("component", "checkedAt");

-- CreateIndex
CREATE INDEX "StatusCheck_checkedAt_idx" ON "StatusCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "Incident_startedAt_idx" ON "Incident"("startedAt");

