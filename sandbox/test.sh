#!/usr/bin/env bash

source_file="${1:-main.cpp}"

case "$source_file" in
    main.cpp|compile_error.cpp|infinite_loop.cpp)
        ;;
    *)
        echo "请选择约定的三个测试文件之一"
        exit 2
        ;;
esac

if [ ! -f "examples/$source_file" ]; then
    echo "找不到测试文件，请在 sandbox 目录执行"
    exit 2
fi

sudo docker run --rm --network none --memory=256m --memory-swap=256m --cpus=0.5 --pids-limit=64 --cap-drop=ALL --security-opt=no-new-privileges --read-only --tmpfs /tmp:rw,size=32m,noexec,mode=1777 --tmpfs /box:rw,size=32m,exec,uid=1000,gid=1000,mode=0700 --mount "type=bind,src=$PWD/examples,dst=/src,readonly" cpp-sandbox:dev bash -c 'timeout 10s g++ -std=c++17 "/src/$1" -o /box/main && timeout 2s /box/main' -- "$source_file"

result=$?
echo "本次退出码：$result"
exit "$result"