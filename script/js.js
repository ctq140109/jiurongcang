        $(".assess-footer ul li label").on('touchstart',function(){
            if($(this).hasClass('assd')){
                $(".assess-footer ul li label").removeClass("assd")
            }else{
                $(".assess-footer ul li label").addClass("assd")
            };
        });
            
//匿名评价
        var isclick = false;
        function change(mydivid,num) {
        if (!isclick) {
            var tds = $("#"+mydivid+" ul li");
            for (var i = 0; i < num; i++) {
                var td = tds[i];
                $(td).find("img").attr("src","../../image\/star-on.png");
            }
            var tindex = $("#"+mydivid).attr("currentIndex");
            tindex = tindex==0?0:tindex+1;
            for (var j = num; j < tindex; j++) {
                var td = tds[j];
                $(td).find("img").attr("src","../../image\/star-off.png");
            }
            $("#"+mydivid).attr("currentIndex",num);           
            $("#"+mydivid+"one").attr("value",num);          
        }
    }
        function repeal(mydivid,num) {
            if (!isclick) {
                var tds = $("#"+mydivid+" ul li");
                var tindex = $("#"+mydivid).attr("currentIndex");
                tindex = tindex==0?0:tindex+1;
                for (var i = tindex; i < num; i++) {
                    var td = tds[i];
                    $(td).find("img").attr("src","../../image\/star-off.png");
                }
                $("#"+mydivid).attr("currentIndex",num);
                $("#"+mydivid+"one").attr("value",num);          
            }

        }
        function change1(mydivid,num) {
            if (!isclick) {
                change(mydivid,num);

            }
            else {
                alert("Sorry,You had clicked me!");
            }
        }
        $(function(){
            initEvent('mydiv1');
        });
        function initEvent(mydivid) {
            var tds = $("#"+mydivid+" ul li");
            for (var i = 0; i < tds.length; i++) {
                var td = tds[i];
                $(td).live('mouseover',function(){var num = $(this).attr("num");change(mydivid,num);});
                $(td).live('click',function(){var num = $(this).attr("num");change1(mydivid,num);});
            }
        }