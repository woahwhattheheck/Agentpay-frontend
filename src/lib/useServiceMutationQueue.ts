"use client";

import { useEffect, useState } from "react";
import {
  getServiceMutationQueueSnapshot,
  subscribeServiceMutationQueue,
  type ServiceMutationQueueSnapshot,
} from "@/lib/serviceMutationQueue";

const EMPTY: ServiceMutationQueueSnapshot = {
  pending: 0,
  conflicts: 0,
  total: 0,
  isFlushing: false,
  conflictItems: [],
};

export function useServiceMutationQueue(): ServiceMutationQueueSnapshot {
  const [snapshot, setSnapshot] = useState<ServiceMutationQueueSnapshot>(EMPTY);

  useEffect(() => {
    const update = () => setSnapshot(getServiceMutationQueueSnapshot());
    update();
    return subscribeServiceMutationQueue(update);
  }, []);

  return snapshot;
}

