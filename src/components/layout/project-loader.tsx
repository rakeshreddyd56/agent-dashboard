'use client';

import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/lib/store/project-store';

export function ProjectLoader() {
  const { setProjects, setActiveProject } = useProjectStore();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.projects) {
          setProjects(data.projects);
          if (data.projects.length > 0) {
            const firstReal = data.projects.find((p: { isDemo: boolean }) => !p.isDemo);
            setActiveProject((firstReal || data.projects[0]).id);
          }
        }
      })
      .catch(console.error);
  }, [setProjects, setActiveProject]);

  return null;
}
