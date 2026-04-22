import { useAuth } from "@/features/auth";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import { UjuCard } from "../shared/UjuCard";

const NASUN_APPS = [
  { id: "pado",   name: "Pado",     url: "https://pado.finance",          nftType: "alliance" as const },
  { id: "gnasun", name: "gNasun",   url: "https://gnasun.nasun.io",       nftType: null },
  { id: "baram",  name: "Baram AI", url: "https://baram.nasun.io",        nftType: null },
];

export function ActivatedAppsSection() {
  const { user } = useAuth();
  const { activations, isLoading } = useEcosystemStatus(
    user?.cognitoToken,
    user?.identityId,
  );

  const activeCount = activations.filter((a) => a.status === "ACTIVE").length;

  return (
    <UjuCard>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-uju-secondary">Activated Apps</p>
        {!isLoading && (
          <span className="text-sm font-semibold text-nasun-c3">{activeCount} active</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {NASUN_APPS.map((app) => (
            <div key={app.id} className="h-9 bg-uju-border/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {NASUN_APPS.map((app) => {
            const isActive =
              app.nftType
                ? activations.some(
                    (a) => a.nftType === app.nftType && a.status === "ACTIVE",
                  )
                : null;

            return (
              <li
                key={app.id}
                className="flex items-center justify-between py-1.5"
              >
                <span className="text-sm font-medium text-uju-primary">{app.name}</span>
                <div className="flex items-center gap-3">
                  {isActive !== null && (
                    <span
                      className={`text-sm font-medium ${
                        isActive ? "text-pado-4" : "text-uju-secondary"
                      }`}
                    >
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  )}
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-pado-3 hover:underline"
                  >
                    Open
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </UjuCard>
  );
}
