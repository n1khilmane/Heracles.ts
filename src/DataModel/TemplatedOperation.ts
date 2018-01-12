import * as URITemplate from "uri-templates";
import { hydra } from "../namespaces";
import LinksCollection from "./Collections/LinksCollection";
import OperationsCollection from "./Collections/OperationsCollection";
import ResourceFilterableCollection from "./Collections/ResourceFilterableCollection";
import TypesCollection from "./Collections/TypesCollection";
import { IClass } from "./IClass";
import { IIriTemplate } from "./IIriTemplate";
import { IOperation } from "./IOperation";
import { IResource } from "./IResource";
import { ITemplatedOperation } from "./ITemplatedOperation";

/**
 * Provides a default implementation of the {@link ITemplatedOperation} interface.
 * @class
 */
export default class TemplatedOperation implements ITemplatedOperation {
  private static id = 0;

  private readonly template: string;

  public readonly baseUrl: string;

  public readonly iri: string;

  public readonly type: TypesCollection;

  public readonly target: IResource;

  public readonly method: string;

  public readonly expects: ResourceFilterableCollection<IClass>;

  public readonly operations: OperationsCollection;

  public readonly links: LinksCollection;

  /**
   * Initializes a new instance of the {@link TemplatedOperation} class.
   * @param operationResource {IOperation} Original operation to create templated one from.
   * @param template {IIriTemplate} IRI template to take template from.
   */
  public constructor(operationResource: IOperation, template: IIriTemplate) {
    const types = [...operationResource.type].concat([hydra.Operation, hydra.IriTemplate]);
    this.baseUrl = operationResource.baseUrl;
    this.iri = `_:bnode${++TemplatedOperation.id}`;
    this.type = new TypesCollection(types.filter((type, index) => types.indexOf(type) === index));
    this.method = operationResource.method;
    this.expects = operationResource.expects;
    this.links = operationResource.links;
    this.target = null;
    this.template = template.template;
    this.operations = new OperationsCollection([]);
  }

  public expandTarget(templateVariables: { [name: string]: string }): IOperation {
    const targetUri = URITemplate(this.template)
      .fillFromObject(templateVariables)
      .toString();
    const target = targetUri.match(/^[a-zA-Z][a-zA-Z0-9_]*:/) ? targetUri : new URL(targetUri, this.baseUrl).toString();
    return {
      baseUrl: this.baseUrl,
      expects: this.expects,
      iri: `_:operation${++TemplatedOperation.id}`,
      links: this.links,
      method: this.method,
      operations: this.operations,
      target: { iri: target, type: new TypesCollection([]) },
      type: new TypesCollection([...this.type].filter(type => type !== hydra.IriTemplate))
    };
  }
}