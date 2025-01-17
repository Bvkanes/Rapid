import { EventEmitter } from '@pixi/utils';


/**
 * `AbstractSystem` is the base class from which all systems and services inherit.
 * "Systems" are the core components of Rapid.
 * "Services" are extension components that connect to other web services and fetch data.
 * They are owned by the Context. All systems are EventEmitters
 *
 * System Components all go through a standard lifecycle.
 * `constructor()` -> `initAsync()` -> `startAsync()`
 *
 * `constructor()` - called one time and passed the Context.
 *   At this stage all components are still being constructed, in no particular order.
 *   You should not call other components or use the context in the constructor.
 *
 * initAsync() - called one time after all systems are constructed.
 *   Systems may check at init time that their dependencies are met.
 *   They may chain onto other system initAsync promises in order to establish a dependency graph.
 *   (for example, if DataLoaderSystem must be initialized and ready
 *    so that the ImagerySystem can start fetching its imagery index)
 *   initAsync is also a good place to set up event listeners.
 *   After 'init', the component should mostly be able to function normally.
 *   You should be able to call methods but there is no user interface yet.
 *   and no events will be dispatched yet.
 *
 * startAsync() - called one time after all systems are initialized
 *   At this stage we are creating the user interface and the map.
 *   There is an `autoStart` property that defaults to `true` but can be set `false` for some systems.
 *   (for example Map3dSystem doesn't need to load and start MapLibre until the user actually decides
 *    they want to see it - it is another component's job to call `startAsync() in this situation`)
 *   Like with init, components can chain onto other components startAsync promises they depend on.
 *   After 'start', the system should be doing its job and dispatching events.
 *
 * resetAsync() - called after completing an edit session to reset any internal state
 *   Resets mainly happen when completing an edit session, but can happen other times
 *   for example entering/exiting the tutorial or when switching connection between live/dev OSM API.
 *
 * Properties you can access:
 *   `id`        `String`   Identifier for the system (e.g. 'l10n')
 *   `autoStart` `Boolean`  True to start automatically when initializing the context
 */
export class AbstractSystem extends EventEmitter {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;
    this.id = '';
    this.dependencies = new Set();
    this.autoStart = true;

    this._started = false;
  }

  /**
   * started
   * @readonly
   */
  get started() {
    return this._started;
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }
    return Promise.resolve();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }

}
