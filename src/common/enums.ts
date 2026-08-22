import { registerEnumType } from "@nestjs/graphql";

export enum Severity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}
registerEnumType(Severity, { name: "Severity" });

export enum StructureType {
  BRIDGE = "bridge",
  DAM = "dam",
  BUILDING = "building",
  TUNNEL = "tunnel",
}
registerEnumType(StructureType, { name: "StructureType" });

export enum CaptureSource {
  WEB = "web",
  MOBILE = "mobile",
  UAV = "uav",
  FIXED_CAMERA = "fixed-camera",
}
registerEnumType(CaptureSource, { name: "CaptureSource" });
