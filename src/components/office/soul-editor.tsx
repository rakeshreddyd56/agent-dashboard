'use client';

import { useEffect, useState } from 'react';

const ROLES: { key: string; label: string }[] = [
  { key: 'rataa-research', label: 'Robin-Research' },
  { key: 'rataa-frontend', label: 'Nami-Frontend' },
  { key: 'rataa-backend', label: 'Franky-Backend' },
  { key: 'rataa-ops', label: 'Luffy-Ops' },
  { key: 'architect', label: 'Usopp-Architect' },
  { key: 'frontend', label: 'Sanji-Frontend' },
  { key: 'backend', label: 'Zoro & Law-Backend' },
  { key: 'tester', label: 'Smoker & Tashigi-Tester' },
  { key: 'researcher', label: 'Chopper/Brook/Jinbe/Carrot' },
];

export function SoulEditor() {
  const [selectedRole, setSelectedRole] = useState(ROLES[0].key);
  const [soulContent, setSoulContent] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/office/memory?role=${selectedRole}`)
      .then((r) => r.json())
      .then((d) => setSoulContent(d.soul))
      .catch(() => setSoulContent(null));
  }, [selectedRole]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">SOUL Files</h3>
      </div>

      {/* Role Selector */}
      <div className="flex flex-wrap gap-1">
        {ROLES.map((r) => (
          <button
            key={r.key}
            onClick={() => setSelectedRole(r.key)}
            className={`px-2 py-1 text-[10px] rounded ${
              selectedRole === r.key ? 'bg-[#6366f1] text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Soul Content */}
      <div className="bg-muted/30 rounded p-3 max-h-[500px] overflow-y-auto">
        {soulContent ? (
          <pre className="text-[10px] whitespace-pre-wrap text-muted-foreground leading-relaxed">
            {soulContent}
          </pre>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">
            No SOUL file found for {selectedRole}
          </p>
        )}
      </div>
    </div>
  );
}
