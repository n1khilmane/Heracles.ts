import TypesCollection from "../DataModel/Collections/TypesCollection";
import { IResource } from "../DataModel/IResource";
import { IDictionary } from "../IDictionary";
import { IHydraClient } from "../IHydraClient";
import { LinksPolicy } from "../LinksPolicy";
import { factories } from "./factories";

type Notification = (processingState: ProcessingState, resource: IResource) => void;

/**
 * Maintains a JSON-LD processing context.
 * @class
 */
export default class ProcessingState {
  private finalHypermedia: IResource[] = null;

  /**
   * Gets the currently processed object.
   * @readonly
   * @returns {object}
   */
  public readonly processedObject: object;

  /**
   * Gets all hypermedia discovered.
   * @readonly
   * @returns {Array<IResource>}
   */
  public get hypermedia(): IResource[] {
    if (this.finalHypermedia === null) {
      this.finalHypermedia = [];
      for (const resource of this.allHypermedia) {
        if (!this.forbiddenHypermedia[resource.iri]) {
          this.finalHypermedia.push(resource);
        }
      }
    }

    return this.finalHypermedia;
  }

  /**
   * Gets the processed object's owning resource's IRI. This owning resource may not be a direct parent.
   * @readonly
   * @returns {string}
   */
  public readonly ownerIri: string;

  /**
   * Gets the processed object's parent resource's IRI.
   * @readonly
   * @returns {string}
   */
  public readonly parentIri: string;

  /**
   * Gets the base URL to use for relative ones.
   * @readonly
   * @returns {string}
   */
  public readonly baseUrl: string;

  /**
   * Gets the protocol, host and port of the {@link baseUrl};
   * @readonly
   * @returns {string}
   */
  public readonly rootUrl: string;

  /**
   * Gets the current links policy.
   * @readonly
   * @returns {LinksPolicy}
   */
  public readonly linksPolicy: LinksPolicy;

  /**
   * Gets the processed object's resource.
   * This is provided once the {@link ProcessingState.provideResource(boolean) is called.
   * @type {IResource = null}
   */
  public currentResource: IResource = null;

  private readonly resourceMap: IDictionary<IResource>;
  private readonly forbiddenHypermedia: IDictionary<boolean>;
  private readonly allHypermedia: IResource[];
  private readonly client: IHydraClient;
  private readonly foundResources: IDictionary<any>;
  private readonly payload: object[];
  private readonly notifications: IDictionary<Notification[]>;

  /**
   * Initializes a new instance of the {@link ProcessingState} class.
   * @param {Array<object>} graphToProcess Actual graph to process.
   * @param {string} baseUrl Base URL.
   * @param {IHydraClient} client Hydra client instance.
   * @param {LinksPolicy} linksPolicy Policy defining what is considered a link.
   */
  public constructor(graphToProcess: object[], baseUrl: string, client: IHydraClient, linksPolicy: LinksPolicy);

  /**
   * Initializes a new instance of the {@link ProcessingState} class.
   * @param {object} objectToProcess Actual object to process.
   * @param {string} ownerIri Object to process owning resource's IRI.
   * @param {string} parentIri Object to process parent resource's IRI.
   * @param {ProcessingState} parentState Parent processing state to obtain more details from.
   */
  public constructor(objectToProcess: object, ownerIri: string, parentIri: string, parentState: ProcessingState);

  public constructor(
    objectToProcess: object | object[],
    baseUrlOrOwnerIri: string,
    clientOrParentIri: IHydraClient | string = null,
    parentContextOrLinksPolicy: any = null
  ) {
    if (arguments[3] instanceof ProcessingState) {
      const parentState = parentContextOrLinksPolicy as ProcessingState;
      this.resourceMap = parentState.resourceMap;
      this.allHypermedia = parentState.allHypermedia;
      this.payload = parentState.payload;
      this.forbiddenHypermedia = parentState.forbiddenHypermedia;
      this.baseUrl = parentState.baseUrl;
      this.parentIri = clientOrParentIri as string;
      this.client = parentState.client;
      this.linksPolicy = parentState.linksPolicy;
      this.foundResources = parentState.foundResources;
      this.notifications = parentState.notifications;
    } else {
      this.resourceMap = {};
      this.allHypermedia = [];
      this.payload = objectToProcess as object[];
      this.forbiddenHypermedia = {};
      this.baseUrl = baseUrlOrOwnerIri;
      this.parentIri = baseUrlOrOwnerIri;
      this.client = clientOrParentIri as IHydraClient;
      this.linksPolicy = parentContextOrLinksPolicy as LinksPolicy;
      this.foundResources = {};
      this.notifications = {};
    }

    const baseUrl = new URL(this.baseUrl);
    this.rootUrl = `${baseUrl.protocol}//${baseUrl.host}/`;
    this.processedObject = objectToProcess;
    this.ownerIri = baseUrlOrOwnerIri;
    if (Object.keys(this.processedObject).length === 1 && Object.keys(this.processedObject)[0] === "@id") {
      this.processedObject = this.findRawResource(this.processedObject["@id"]) || this.processedObject;
    }
  }

  /**
   * Marks as owned hypermedia, this the given iri won't be available as a standalone hypermedia control.
   * @param {string} iri Iri to be marked.
   */
  public markAsOwned(iri: string) {
    this.forbiddenHypermedia[iri] = true;

    if (!!this.allHypermedia[iri]) {
      this.allHypermedia.splice(this.allHypermedia[iri], 1);
      for (let index = this.allHypermedia[iri]; index < this.allHypermedia.length; index++) {
        this.allHypermedia[this.allHypermedia[index].iri] = index;
      }

      delete this.allHypermedia[iri];
    }
  }

  /**
   * Searches an original response payload for a resource of a given Iri.
   * @param {string} iri Resource's Iri to search for.
   * @returns {any}
   */
  public findRawResource(iri: string) {
    let result = !!iri ? this.foundResources[iri] : null;
    if (typeof result === "undefined") {
      this.foundResources[iri] = result = this.payload.find(_ => _["@id"] === iri) || null;
    }

    return result;
  }

  /**
   * Gets a visited resource.
   * @param {string} iri Iri of the resource to be obtained.
   * @returns {any}
   */
  public getVisitedResource(iri: string): any {
    return !!iri && !!this.resourceMap[iri] ? this.resourceMap[iri] : null;
  }

  /**
   * Creates a child processing context.
   * @param {object} objectToProcess Nested object to be processed.
   * @returns {ProcessingState}
   */
  public copyFor(objectToProcess: object): ProcessingState {
    let ownerIri = this.ownerIri;
    if (this.currentResource !== null) {
      ownerIri = this.currentResource.iri;
    }

    let parentIri: string = ownerIri;
    if (this.processedObject !== this.payload) {
      parentIri = this.processedObject["@id"];
    } else {
      const parentResource = this.payload.find(
        resource =>
          !!Object.keys(resource)
            .filter(predicate => predicate.charAt(0) !== "@")
            .find(predicate => !!resource[predicate].find(value => value["@id"] === objectToProcess["@id"]))
      );
      parentIri = !!parentResource ? parentResource["@id"] : parentIri;
    }

    return new ProcessingState(objectToProcess, ownerIri, parentIri, this);
  }

  /**
   * Creates a resource representation of the object being processed.
   * @param {boolean = true} addToHypermedia Value indicating whether to add this resource to the
   *                                         {@link ProcessingState.hypermedia} collection.
   * @returns {IResource}
   */
  public provideResource(addToHypermedia: boolean = true): IResource {
    let result = this.resourceMap[this.processedObject["@id"]];
    if (!result) {
      result = this.createResource(this.processedObject["@id"], this.processedObject["@type"]);
    }

    if (addToHypermedia) {
      this.allHypermedia[result.iri] = this.allHypermedia.length;
      this.allHypermedia.push(result);
    } else {
      this.markAsOwned(result.iri);
    }

    return (this.currentResource = result);
  }

  /**
   * Registers a handler to be invoked once the resource of a given Iri is materialized.
   * @param {string} iri Iri of the resource that must be materialized for notification.
   * @param {Notification} notification Delegate used for invocation.
   */
  public notifyMaterialized(iri: string, notification: Notification): void {
    let notifications = this.notifications[iri];
    if (!notifications) {
      this.notifications[iri] = notifications = [];
    }

    notifications.push(notification);
  }

  /**
   * Raises notifications about resource materialized.
   * @param {IResource} resource Resource that was just materialized.
   */
  public onMaterialized(resource: IResource): void {
    if (!!this.notifications[resource.iri]) {
      for (const notification of this.notifications[resource.iri]) {
        notification(this, resource);
      }

      delete this.notifications[resource.iri];
    }
  }

  private createResource(iri: string, types: string[]): IResource {
    let result = {
      iri,
      type: !!types ? new TypesCollection(types) : TypesCollection.empty
    };

    for (const expectedType of Object.keys(factories)) {
      if (result.type.contains(expectedType)) {
        result = factories[expectedType](result, this.client, this);
      }
    }

    return (this.resourceMap[result.iri] = result);
  }
}
