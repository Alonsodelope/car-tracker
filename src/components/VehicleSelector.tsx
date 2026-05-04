"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { VEHICLE_PROFILES, type VehicleProfile } from "@/lib/collectors/base";

interface VehicleSelectorProps {
  currentKey: string;
}

export function VehicleSelector({ currentKey }: VehicleSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleSelect(profile: VehicleProfile) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("vehicle", profile.key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-muted/40">
      {VEHICLE_PROFILES.map((profile) => {
        const active = profile.key === currentKey;
        return (
          <button
            key={profile.key}
            onClick={() => handleSelect(profile)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              active
                ? "bg-white shadow-sm text-foreground border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {profile.shortName}
          </button>
        );
      })}
    </div>
  );
}
