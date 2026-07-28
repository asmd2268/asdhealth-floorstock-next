import "server-only";

import {
  createAdministrationQueryService,
  type AdministrationQueryService,
} from "./service";
import { getAdministrationRepository } from "./repository";

let service: AdministrationQueryService | undefined;

export function getAdministrationQueryService(): AdministrationQueryService {
  service ??= createAdministrationQueryService(getAdministrationRepository());
  return service;
}
