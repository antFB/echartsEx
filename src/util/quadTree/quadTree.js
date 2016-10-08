define(function(require){
    //--------------require部分开始--------------
    var tree_add=require('./add');
    var tree_cover=require('./cover');
    var tree_visit=require('./visit');
    var tree_visitAfter=require('./visitAfter');
    var tree_find=require('./find');
    var tree_remove=require('./remove')
    //--------------require部分结束--------------


    //-------------constructor start-----------------
    function Quadtree(x, y, x0, y0, x1, y1) {
        this._x = x;
        this._y = y;
        this._x0 = x0;
        this._y0 = y0;
        this._x1 = x1;
        this._y1 = y1;
        this._root = undefined;
    }
    //-------------constructor end-------------------

    //-------------prototype方法定义开始-----------------
    var quadtreeProto= Quadtree.prototype

    quadtreeProto.x=function(_){
        return arguments.length?(this._x=_,this):this._x
    }

    quadtreeProto.y=function(_){
        return arguments.length?(this._y=_,this):this._y
    }
    quadtreeProto.data=function() {
        var data = [];
        this.visit(function(node) {
            if (!node.length) do data.push(node.data); while (node = node.next)
        });
        return data;
    }
    quadtreeProto.extent=function(_) {
        return arguments.length
            ? this.cover(+_[0][0], +_[0][1]).cover(+_[1][0], +_[1][1])
            : isNaN(this._x0) ? undefined : [[this._x0, this._y0], [this._x1, this._y1]];
    }

    quadtreeProto.root=function() {
        return this._root;
    }

    quadtreeProto.size=function() {
        var size = 0;
        this.visit(function(node) {
            if (!node.length) do ++size; while (node = node.next)
        });
        return size;
    }

    quadtreeProto.add=tree_add.add;
    quadtreeProto.addAll=tree_add.addAll;
    quadtreeProto.cover=tree_cover;
    quadtreeProto.visit=tree_visit;
    quadtreeProto.visitAfter=tree_visitAfter;
    quadtreeProto.find=tree_find;
    quadtreeProto.remove=tree_remove.remove;
    quadtreeProto.removeAll=tree_remove.removeAll;
    //-------------prototype方法定义结束-----------------



    //------------导出内容开始----------------------
    return function(nodes ,x,y){
        var tree = new Quadtree(x == null ? defaultX : x, y == null ? defaultY : y, NaN, NaN, NaN, NaN);
        return nodes == null ? tree : tree.addAll(nodes);
    }
    //------------导出内容结束----------------------

    //----------------内部方法开始---------------------

    function defaultX(d){
        return d[0]
    }
    function defaultY(d){
        return d[1]
    }
    //-----------------内部方法结束----------------------

})
