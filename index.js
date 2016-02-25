define([
    'lib/underscore'
  , 'lib/js-data'
  , 'lib/bluebird'
  , 'component/config/index'
  , 'component/filter/converter/odata-4'
  , 'component/http/channel/odata'
  , 'component/http/util/multipart'
],
function(_, JSData, Promise, config, odata_query, odata, multipart){

  function paramsToQuery(params) {
    var ret     = {}
      , params  = params || {}
      , where   = params.where && _.clone(params.where);
      ;

    var search = where && where['*'] && where['*']['contains'];
    if (!_.isEmpty(search)) {
      ret.$search = search;
      delete where['*'];
    }

    if (!_.isEmpty(where)) {
      ret.$filter = odata_query.convert(where);
      if (_.isEmpty(ret.$filter)) {
        delete ret.$filter;
      }
    }

    if (!_.isEmpty(params.expand) && _.isArray(params.expand)) {
      ret.$expand = params.expand.join(',');
    }

    if (!_.isUndefined(params.limit)) {
      ret.$top = params.limit;
    }

    // todo [akamel] MT requires a limit
    ret.$top = ret.$top || 20;

    if (!_.isUndefined(params.offset)) {
      ret.$skip = params.offset;
    }

    ret.$count = true;
    
    // todo [akamel] only supports one order column
    // todo [akamel] this expects mongo style orderby obj; rely on js-data syntax for this instead...
    if (_.size(params.orderBy)) {
      var arr = _.map(params.orderBy, function(item){
        if(_.isString(item)) {
          return item  + ' asc';
        }

        return item[0] + ' ' + item[1].toLowerCase();
      });

      ret.$orderby = arr.join(',');
    }

    if (!_.isEmpty(params.query)) {
      ret = _.extend(ret, params.query);
    }

    return ret;
  }

  function ODataAdapater() {
    
  }

  function getCast(options) {
    return (options && !_.isEmpty(options.cast)) ? ('/' + options.cast) : '';
  }

  function getParent(options) {
    return (options && !_.isEmpty(options.parent)) ? (options.parent + '/') : '';
  }

  function getUri(definition, options, id) {
    if (!_.isUndefined(id)) {
      return '/Customers(:customer_id)/Accounts(:account_id)/' + getParent(options) + definition.name + '(' + id + ')' + getCast(options);
    }

    return '/Customers(:customer_id)/Accounts(:account_id)/' + getParent(options) + definition.name + getCast(options)
  }

  //TODO: [ericwa] batch need to add odata header by default
  function getOdataUri(definition, options) {
    return '/ODataApi/' + config.get('odata.path') + getUri(definition, options);
  }

  function sendBatchRequest(definition, params, options) {
    var uri = getOdataUri(definition, options);
    var reqs = _.map(params, function(param) {
      return {
        type : options.action,
        url  : uri,
        data : param
      }
    });

    return odata
            .batch({reqs: reqs, host: 'odata.url'})
            .then(function(res) {
              return multipart.parse(res);
            }.bind(this));
  }

  // All of the methods shown here must return a promise

  // "definition" is a resource defintion that would
  // be returned by DS#defineResource

  // "options" would be the options argument that
  // was passed into the DS method that is calling
  // the adapter method

  ODataAdapater.prototype.create = function (definition, attrs, options) {
    // Must resolve the promise with the created item
     return odata
            .post(getUri(definition, options), { data : attrs })
            .then(function(res){
              return res;
            });
  };

  ODataAdapater.prototype.find = function (definition, id, options) {
    // Must resolve the promise with the found item
    return odata
            .get(getUri(definition, options, id), {})
            .then(function(res){
              return res;
            });
  };

  ODataAdapater.prototype.findAll = function (definition, params, options) {
    // Must resolve the promise with the found items
    options = options || {};
    var query = paramsToQuery(params, options.fieldMap);

    return odata
            .get(getUri(definition, options), { data : query })
            .then(function(res){
              var addPropertyTotalCount = function(options, injected) {
                Object.defineProperty(injected, 'totalCount', {
                  value: res['@odata.count'],
                  enumerable: false
                });
              };

              if(options.cacheResponse != false) {
                options.afterInject = options.afterInject ? _.compose(options.afterInject, addPropertyTotalCount) : addPropertyTotalCount;
              } else {
                addPropertyTotalCount(options, res.value);
              }

              return res.value;
            });
  };

  ODataAdapater.prototype.update = function (definition, id, attrs, options) {
    return odata
            .patch(getUri(definition, options, id),  { data : attrs })
            .then(function(res){
              return res;
            });
  };

  ODataAdapater.prototype.updateAll = function (definition, attrs, params, options) {
    // Must resolve the promise with the updated items
    return sendBatchRequest(definition, params.reqs, options);
  };

  ODataAdapater.prototype.destroy = function (definition, id, options) {
    // Must return a promise
    return odata
            .delete(getUri(definition, options, id), {})
            .then(function(res){
              return res.value;
            });
  };

  ODataAdapater.prototype.destroyAll = function (definition, params, options) {
    return sendBatchRequest(definition, params.reqs, options);
  };

  return ODataAdapater;
});