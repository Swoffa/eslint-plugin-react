/**
 * @fileoverview Common used propTypes detection functionality.
 */

'use strict';

const astUtil = require('./ast');
const versionUtil = require('./version');
const ast = require('./ast');

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const DIRECT_PROPS_REGEX = /^props\s*(\.|\[)/;
const DIRECT_NEXT_PROPS_REGEX = /^nextProps\s*(\.|\[)/;
const DIRECT_PREV_PROPS_REGEX = /^prevProps\s*(\.|\[)/;
const LIFE_CYCLE_METHODS = ['componentWillReceiveProps', 'shouldComponentUpdate', 'componentWillUpdate', 'componentDidUpdate'];
const ASYNC_SAFE_LIFE_CYCLE_METHODS = ['getDerivedStateFromProps', 'getSnapshotBeforeUpdate', 'UNSAFE_componentWillReceiveProps', 'UNSAFE_componentWillUpdate'];

/**
 * Checks if a prop init name matches common naming patterns
 * @param {ASTNode} node The AST node being checked.
 * @returns {Boolean} True if the prop name matches
 */
function isPropAttributeName(node) {
  return (
    node.init.name === 'props' ||
    node.init.name === 'nextProps' ||
    node.init.name === 'prevProps'
  );
}

/**
 * Checks if the component must be validated
 * @param {Object} component The component to process
 * @returns {Boolean} True if the component must be validated, false if not.
 */
function mustBeValidated(component) {
  return !!(component && !component.ignorePropsValidation);
}

/**
 * Check if we are in a class constructor
 * @return {boolean} true if we are in a class constructor, false if not
 */
function inComponentWillReceiveProps(context) {
  let scope = context.getScope();
  while (scope) {
    if (
      scope.block &&
      scope.block.parent &&
      scope.block.parent.key &&
      scope.block.parent.key.name === 'componentWillReceiveProps'
    ) {
      return true;
    }
    scope = scope.upper;
  }
  return false;
}

/**
 * Check if we are in a lifecycle method
 * @return {boolean} true if we are in a class constructor, false if not
 */
function inLifeCycleMethod(context, checkAsyncSafeLifeCycles) {
  let scope = context.getScope();
  while (scope) {
    if (scope.block && scope.block.parent && scope.block.parent.key) {
      const name = scope.block.parent.key.name;

      if (LIFE_CYCLE_METHODS.indexOf(name) >= 0) {
        return true;
      }
      if (checkAsyncSafeLifeCycles && ASYNC_SAFE_LIFE_CYCLE_METHODS.indexOf(name) >= 0) {
        return true;
      }
    }
    scope = scope.upper;
  }
  return false;
}

/**
 * Returns true if the given node is a React Component lifecycle method
 * @param {ASTNode} node The AST node being checked.
 * @return {Boolean} True if the node is a lifecycle method
 */
function isNodeALifeCycleMethod(node, checkAsyncSafeLifeCycles) {
  const nodeKeyName = (node.key || /** @type {ASTNode} */ ({})).name;

  if (node.kind === 'constructor') {
    return true;
  }
  if (LIFE_CYCLE_METHODS.indexOf(nodeKeyName) >= 0) {
    return true;
  }
  if (checkAsyncSafeLifeCycles && ASYNC_SAFE_LIFE_CYCLE_METHODS.indexOf(nodeKeyName) >= 0) {
    return true;
  }

  return false;
}

/**
 * Returns true if the given node is inside a React Component lifecycle
 * method.
 * @param {ASTNode} node The AST node being checked.
 * @return {Boolean} True if the node is inside a lifecycle method
 */
function isInLifeCycleMethod(node, checkAsyncSafeLifeCycles) {
  if ((node.type === 'MethodDefinition' || node.type === 'Property') && isNodeALifeCycleMethod(node, checkAsyncSafeLifeCycles)) {
    return true;
  }

  if (node.parent) {
    return isInLifeCycleMethod(node.parent, checkAsyncSafeLifeCycles);
  }

  return false;
}

/**
 * Check if the current node is in a setState updater method
 * @return {boolean} true if we are in a setState updater, false if not
 */
function inSetStateUpdater(context) {
  let scope = context.getScope();
  while (scope) {
    if (
      scope.block && scope.block.parent &&
      scope.block.parent.type === 'CallExpression' &&
      scope.block.parent.callee.property &&
      scope.block.parent.callee.property.name === 'setState' &&
      // Make sure we are in the updater not the callback
      scope.block.parent.arguments[0].start === scope.block.start
    ) {
      return true;
    }
    scope = scope.upper;
  }
  return false;
}

function isPropArgumentInSetStateUpdater(context, node) {
  let scope = context.getScope();
  while (scope) {
    if (
      scope.block && scope.block.parent &&
      scope.block.parent.type === 'CallExpression' &&
      scope.block.parent.callee.property &&
      scope.block.parent.callee.property.name === 'setState' &&
      // Make sure we are in the updater not the callback
      scope.block.parent.arguments[0].start === scope.block.start &&
      scope.block.parent.arguments[0].params &&
      scope.block.parent.arguments[0].params.length > 1
    ) {
      return scope.block.parent.arguments[0].params[1].name === node.object.name;
    }
    scope = scope.upper;
  }
  return false;
}

/**
 * Checks if the prop has spread operator.
 * @param {ASTNode} node The AST node being marked.
 * @returns {Boolean} True if the prop has spread operator, false if not.
 */
function hasSpreadOperator(context, node) {
  const tokens = context.getSourceCode().getTokens(node);
  return tokens.length && tokens[0].value === '...';
}

/**
 * Retrieve the name of a property node
 * @param {ASTNode} node The AST node with the property.
 * @return {string|undefined} the name of the property or undefined if not found
 */
function getPropertyName(node, context, utils, checkAsyncSafeLifeCycles) {
  const sourceCode = context.getSourceCode();
  const isDirectProp = DIRECT_PROPS_REGEX.test(sourceCode.getText(node));
  const isDirectNextProp = DIRECT_NEXT_PROPS_REGEX.test(sourceCode.getText(node));
  const isDirectPrevProp = DIRECT_PREV_PROPS_REGEX.test(sourceCode.getText(node));
  const isDirectSetStateProp = isPropArgumentInSetStateUpdater(context, node);
  const isInClassComponent = utils.getParentES6Component() || utils.getParentES5Component();
  const isNotInConstructor = !utils.inConstructor(node);
  const isNotInLifeCycleMethod = !inLifeCycleMethod(context, checkAsyncSafeLifeCycles);
  const isNotInSetStateUpdater = !inSetStateUpdater(context);
  if ((isDirectProp || isDirectNextProp || isDirectPrevProp || isDirectSetStateProp) &&
    isInClassComponent &&
    isNotInConstructor &&
    isNotInLifeCycleMethod &&
    isNotInSetStateUpdater
  ) {
    return;
  }
  if (!isDirectProp && !isDirectNextProp && !isDirectPrevProp && !isDirectSetStateProp) {
    node = node.parent;
  }
  const property = node.property;
  if (property) {
    switch (property.type) {
      case 'Identifier':
        if (node.computed) {
          return '__COMPUTED_PROP__';
        }
        return property.name;
      case 'MemberExpression':
        return;
      case 'Literal':
        // Accept computed properties that are literal strings
        if (typeof property.value === 'string') {
          return property.value;
        }
        // falls through
      default:
        if (node.computed) {
          return '__COMPUTED_PROP__';
        }
        break;
    }
  }
}

/**
 * Checks if we are using a prop
 * @param {ASTNode} node The AST node being checked.
 * @returns {Boolean} True if we are using a prop, false if not.
 */
function isPropTypesUsage(node, context, utils, checkAsyncSafeLifeCycles) {
  const isThisPropsUsage = node.object.type === 'ThisExpression' && node.property.name === 'props';
  const isPropsUsage = isThisPropsUsage || node.object.name === 'nextProps' || node.object.name === 'prevProps';
  const isClassUsage = (
    (utils.getParentES6Component() || utils.getParentES5Component()) &&
    (isThisPropsUsage || isPropArgumentInSetStateUpdater(context, node))
  );
  const isStatelessFunctionUsage = node.object.name === 'props' && !ast.isAssignmentLHS(node);
  return isClassUsage ||
    isStatelessFunctionUsage ||
    (isPropsUsage && inLifeCycleMethod(context, checkAsyncSafeLifeCycles));
}

module.exports = function usedPropTypesInstructions(context, components, utils) {
  const checkAsyncSafeLifeCycles = versionUtil.testReactVersion(context, '16.3.0');

  /**
   * Mark a prop type as used
   * @param {ASTNode} node The AST node being marked.
   * @param {string[]} [parentNames]
   */
  function markPropTypesAsUsed(node, parentNames) {
    parentNames = parentNames || [];
    let type;
    let name;
    let allNames;
    let properties;
    switch (node.type) {
      case 'MemberExpression':
        name = getPropertyName(node, context, utils, checkAsyncSafeLifeCycles);
        if (name) {
          allNames = parentNames.concat(name);
          if (
            // Match props.foo.bar, don't match bar[props.foo]
            node.parent.type === 'MemberExpression' &&
            node.parent.object === node
          ) {
            markPropTypesAsUsed(node.parent, allNames);
          }
          // Do not mark computed props as used.
          type = name !== '__COMPUTED_PROP__' ? 'direct' : null;
        } else if (
          node.parent.id &&
          node.parent.id.properties &&
          node.parent.id.properties.length &&
          ast.getKeyValue(context, node.parent.id.properties[0])
        ) {
          type = 'destructuring';
          properties = node.parent.id.properties;
        }
        break;
      case 'ArrowFunctionExpression':
      case 'FunctionDeclaration':
      case 'FunctionExpression': {
        if (node.params.length === 0) {
          break;
        }
        type = 'destructuring';
        const propParam = inSetStateUpdater(context) ? node.params[1] : node.params[0];
        properties = propParam.type === 'AssignmentPattern' ?
          propParam.left.properties :
          propParam.properties;
        break;
      }
      case 'VariableDeclarator':
        node.id.properties.some((property) => {
          // let {props: {firstname}} = this
          const thisDestructuring = (
            property.key && (
              (property.key.name === 'props' || property.key.value === 'props') &&
              property.value.type === 'ObjectPattern'
            )
          );
          // let {firstname} = props
          const genericDestructuring = isPropAttributeName(node) && (
            utils.getParentStatelessComponent() ||
            isInLifeCycleMethod(node, checkAsyncSafeLifeCycles)
          );

          if (thisDestructuring) {
            properties = property.value.properties;
          } else if (genericDestructuring) {
            properties = node.id.properties;
          } else {
            return false;
          }
          type = 'destructuring';
          return true;
        });
        break;
      default:
        throw new Error(`${node.type} ASTNodes are not handled by markPropTypesAsUsed`);
    }

    const component = components.get(utils.getParentComponent());
    const usedPropTypes = component && component.usedPropTypes || [];
    let ignoreUnusedPropTypesValidation = component && component.ignoreUnusedPropTypesValidation || false;

    switch (type) {
      case 'direct': {
        // Ignore Object methods
        if (name in Object.prototype) {
          break;
        }

        const nodeSource = context.getSourceCode().getText(node);
        const isDirectProp = DIRECT_PROPS_REGEX.test(nodeSource) ||
          DIRECT_NEXT_PROPS_REGEX.test(nodeSource) ||
          DIRECT_PREV_PROPS_REGEX.test(nodeSource);
        const reportedNode = (
          !isDirectProp && !utils.inConstructor() && !inComponentWillReceiveProps(context) ?
            node.parent.property :
            node.property
        );
        usedPropTypes.push({
          name,
          allNames,
          node: reportedNode
        });
        break;
      }
      case 'destructuring': {
        for (let k = 0, l = (properties || []).length; k < l; k++) {
          if (hasSpreadOperator(context, properties[k]) || properties[k].computed) {
            ignoreUnusedPropTypesValidation = true;
            break;
          }
          const propName = ast.getKeyValue(context, properties[k]);

          let currentNode = node;
          allNames = [];
          while (currentNode.property && currentNode.property.name !== 'props') {
            allNames.unshift(currentNode.property.name);
            currentNode = currentNode.object;
          }
          allNames.push(propName);
          if (propName) {
            usedPropTypes.push({
              allNames,
              name: propName,
              node: properties[k]
            });
          }
        }
        break;
      }
      default:
        break;
    }

    components.set(component ? component.node : node, {
      usedPropTypes,
      ignoreUnusedPropTypesValidation
    });
  }

  /**
   * @param {ASTNode} node We expect either an ArrowFunctionExpression,
   *   FunctionDeclaration, or FunctionExpression
   */
  function markDestructuredFunctionArgumentsAsUsed(node) {
    const param = node.params && inSetStateUpdater(context) ? node.params[1] : node.params[0];

    const destructuring = param && (
      param.type === 'ObjectPattern' ||
      param.type === 'AssignmentPattern' && param.left.type === 'ObjectPattern'
    );

    if (destructuring && (components.get(node) || components.get(node.parent))) {
      markPropTypesAsUsed(node);
    }
  }

  function handleSetStateUpdater(node) {
    if (!node.params || node.params.length < 2 || !inSetStateUpdater(context)) {
      return;
    }
    markPropTypesAsUsed(node);
  }

  /**
   * Handle both stateless functions and setState updater functions.
   * @param {ASTNode} node We expect either an ArrowFunctionExpression,
   *   FunctionDeclaration, or FunctionExpression
   */
  function handleFunctionLikeExpressions(node) {
    handleSetStateUpdater(node);
    markDestructuredFunctionArgumentsAsUsed(node);
  }

  function handleCustomValidators(component) {
    const propTypes = component.declaredPropTypes;
    if (!propTypes) {
      return;
    }

    Object.keys(propTypes).forEach((key) => {
      const node = propTypes[key].node;

      if (node.value && astUtil.isFunctionLikeExpression(node.value)) {
        markPropTypesAsUsed(node.value);
      }
    });
  }

  return {
    VariableDeclarator(node) {
      const destructuring = node.init && node.id && node.id.type === 'ObjectPattern';
      // let {props: {firstname}} = this
      const thisDestructuring = destructuring && node.init.type === 'ThisExpression';
      // let {firstname} = props
      const statelessDestructuring = destructuring && isPropAttributeName(node) && (
        utils.getParentStatelessComponent() ||
        isInLifeCycleMethod(node, checkAsyncSafeLifeCycles)
      );

      if (!thisDestructuring && !statelessDestructuring) {
        return;
      }
      markPropTypesAsUsed(node);
    },

    FunctionDeclaration: handleFunctionLikeExpressions,

    ArrowFunctionExpression: handleFunctionLikeExpressions,

    FunctionExpression: handleFunctionLikeExpressions,

    JSXSpreadAttribute(node) {
      const component = components.get(utils.getParentComponent());
      components.set(component ? component.node : node, {
        ignoreUnusedPropTypesValidation: true
      });
    },

    MemberExpression(node) {
      if (isPropTypesUsage(node, context, utils, checkAsyncSafeLifeCycles)) {
        markPropTypesAsUsed(node);
      }
    },

    ObjectPattern(node) {
      // If the object pattern is a destructured props object in a lifecycle
      // method -- mark it for used props.
      if (isNodeALifeCycleMethod(node.parent.parent, checkAsyncSafeLifeCycles) && node.properties.length > 0) {
        markPropTypesAsUsed(node.parent);
      }
    },

    'Program:exit': function () {
      const list = components.list();

      Object.keys(list).filter(component => mustBeValidated(list[component])).forEach((component) => {
        handleCustomValidators(list[component]);
      });
    }
  };
};
