import { type ComponentType, useEffect } from 'react';
import type {
  EntryPoint,
  EntryPointProps,
  JSResourceReference,
} from 'react-relay';
import { useLoaderData } from 'react-router-dom';
import type { OperationType } from 'relay-runtime';

import type {
  BaseEntryPointComponent,
} from './entry-point.types';
import { InternalPreload } from './internal-preload-symbol';

const preloadsToDispose = new Set();

export default function EntryPointRoute(
  resource: JSResourceReference<BaseEntryPointComponent>,
): ComponentType {
  const Hoc: ComponentType & {
    [InternalPreload]?: () => Promise<unknown>;
  } = () => {
    const data = useLoaderData() as EntryPointProps<
      Record<string, OperationType>,
      Record<string, EntryPoint<any, any> | undefined>,
      Record<string, never>,
      Record<string, never>
    >;

    // We need to dispose of preloaded queries when changing routes. React
    // router doesn't provide a mechanism for actually accomplishing this so
    // we have this effect which attempts to do a deferred cleanup. We use a
    // timeout to delay the cleanup to avoid issues when unmounting and re-
    // mounting the same component without a new call to the loader function.
    useEffect(() => {
      if (data.queries == null) {
        return;
      }

      Object.values(data.queries).forEach((preloadedQuery) => {
        preloadsToDispose.delete(preloadedQuery);
      });

      return () => {
        Object.values(data.queries).forEach((preloadedQuery) => {
          preloadsToDispose.add(preloadedQuery);
        });

        setTimeout(() => {
          Object.values(data.queries).forEach((preloadedQuery) => {
            if (preloadsToDispose.delete(preloadedQuery)) {
              preloadedQuery.dispose();
            }
          });
        }, 10);
      };
    }, [data.queries]);

    const Component = resource.getModuleIfRequired();
    if (Component) {
      return <Component {...data} />;
    }
    throw resource.load();
  };
  Hoc.displayName = `EntryPointRoute(${resource.getModuleId()})`;

  // This would be much better if it injected a modulepreload link. Unfortunately
  // we don't have a mechanism for getting the right bundle file name to put into
  // the href. We might be able to do it by building a rollup plugin.
  Hoc[InternalPreload] = () => resource.load();

  return Hoc;
}
